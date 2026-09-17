import type { StoredFinding } from './run-record.schema';
import type { AnswerKey, KeyedDefect } from './answer-key.schema';
import { SEVERITIES } from '../audit/finding.schema';

/**
 * The rule that decides whether a finding is about a keyed defect.
 *
 * Every number this release produces depends on it, and it can fail in both directions.
 * A rule that is too generous makes a vague agent look accurate: widen the tolerance far
 * enough and "there is something wrong in this file" scores as a hit. A rule that is too
 * strict marks a correct finding wrong for citing line 21 when the key says 20.
 *
 * The rule, in one sentence: **a finding matches a keyed defect when it names the same
 * file and its cited span overlaps the keyed span by at least one line.**
 *
 * Everything below is a consequence of that sentence, or a decision about what to do with
 * findings it does not cover.
 */

/** Ranked so severity disagreement has a direction and not just a yes or no. */
const SEVERITY_RANK: Record<(typeof SEVERITIES)[number], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * How far outside a keyed span a cited line may fall and still be reported as a near miss.
 *
 * **This threshold cannot move precision or recall.** A near miss is not a match and never
 * becomes one; it exists so that "found the right defect, cited the wrong line" is visible
 * as something other than "found nothing". Run 11 produced exactly that case — the right
 * file, the right defect, two lines off — and a report with only match and no-match would
 * have shown it as identical to a finding that was simply wrong.
 *
 * Because the number is diagnostic only, choosing it badly costs a slightly noisier report
 * and cannot inflate a score. That is the property that makes an arbitrary constant safe
 * here and would make it dangerous anywhere in the scoring path.
 */
export const NEAR_MISS_LINES = 5;

export const MATCH_OUTCOMES = [
  'matched',
  'duplicate',
  'near_miss',
  'file_only',
  'unkeyed',
] as const;

export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

/** How the key regards the file a finding named. */
export type FileStanding = 'keyed_with_defects' | 'keyed_clean' | 'unknown';

export type SeverityAgreement = 'exact' | 'over' | 'under';

export interface FindingMatch {
  /** Position in the record's findings array, so a result can be traced back. */
  readonly index: number;
  readonly outcome: MatchOutcome;
  readonly file: FileStanding;
  /** Present for matched, duplicate and near_miss. */
  readonly defectId?: string;
  /** Lines between the cited span and the keyed span. Present only for near_miss. */
  readonly lineDistance?: number;
  /** Present only for matched: how the finding's severity compares to the key's. */
  readonly severityAgreement?: SeverityAgreement;
  /** Signed rank difference, positive when the finding is more severe than the key. */
  readonly severityDelta?: number;
}

export interface MatchResult {
  readonly findings: readonly FindingMatch[];
  /** Keyed defect ids that no finding matched. */
  readonly missed: readonly string[];
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Comparable form of a path: forward slashes, no `./` prefix, no trailing slash.
 *
 * Paths are compared exactly after this, never by suffix. Suffix matching would let a
 * finding on `a.ts` claim a defect keyed at `vendor/a.ts`, and a pointing-at-the-wrong-root
 * mistake would then half-work instead of failing visibly.
 */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

/** A finding's own span. A single cited line is a span of one. */
function findingSpan(finding: StoredFinding): Span | undefined {
  if (finding.line === undefined) return undefined;
  return { start: finding.line, end: finding.endLine ?? finding.line };
}

function keyedSpan(defect: KeyedDefect): Span {
  return { start: defect.line, end: defect.endLine };
}

function overlaps(a: Span, b: Span): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Lines between two spans. Zero when they touch or overlap. */
function distance(a: Span, b: Span): number {
  if (overlaps(a, b)) return 0;
  return a.start > b.end ? a.start - b.end : b.start - a.end;
}

function overlapLength(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
}

/**
 * Picks one defect when a finding overlaps several.
 *
 * Only possible when two keyed spans on one file overlap, which a key should avoid but is
 * not forbidden from doing. Resolved by most overlap, then by the tighter keyed span
 * because it is the more specific claim, then by id so the result never depends on the
 * order defects happen to sit in the file.
 */
function best(candidates: readonly KeyedDefect[], span: Span): KeyedDefect {
  return [...candidates].sort((left, right) => {
    const byOverlap =
      overlapLength(span, keyedSpan(right)) -
      overlapLength(span, keyedSpan(left));
    if (byOverlap !== 0) return byOverlap;

    const leftWidth = left.endLine - left.line;
    const rightWidth = right.endLine - right.line;
    if (leftWidth !== rightWidth) return leftWidth - rightWidth;

    return left.id.localeCompare(right.id);
  })[0] as KeyedDefect;
}

function agreement(
  finding: StoredFinding,
  defect: KeyedDefect,
): { severityAgreement: SeverityAgreement; severityDelta: number } {
  const delta =
    SEVERITY_RANK[finding.severity] - SEVERITY_RANK[defect.severity];
  return {
    severityDelta: delta,
    severityAgreement: delta === 0 ? 'exact' : delta > 0 ? 'over' : 'under',
  };
}

/**
 * Matches every finding in a record against a key.
 *
 * Findings are processed in the order the agent produced them, which decides duplicates:
 * the first finding to reach a defect claims it and any later one is a duplicate. Order is
 * the only tiebreak that does not require judging which of two findings is better written,
 * and judging that is exactly what this release refuses to automate.
 *
 * `unkeyed` deliberately does not mean "wrong". Turning it into a false positive is a
 * policy that depends on whether the key claims to be exhaustive, and that decision belongs
 * to the metrics, not here — run 5 found two real defects in this repository that nobody
 * had planted, and a matcher that called those errors would have punished the best run so
 * far.
 */
export function matchFindings(
  findings: readonly StoredFinding[],
  key: AnswerKey,
): MatchResult {
  const defectsByPath = new Map<string, KeyedDefect[]>();
  for (const defect of key.defects) {
    const path = normalizePath(defect.path);
    defectsByPath.set(path, [...(defectsByPath.get(path) ?? []), defect]);
  }

  const standing = new Map<string, FileStanding>();
  for (const file of key.files) {
    standing.set(
      normalizePath(file.path),
      file.expected === 'clean' ? 'keyed_clean' : 'keyed_with_defects',
    );
  }

  const claimed = new Set<string>();
  const matches: FindingMatch[] = [];

  findings.forEach((finding, index) => {
    const path = normalizePath(finding.path);
    const file = standing.get(path) ?? 'unknown';
    const candidates = defectsByPath.get(path) ?? [];
    const span = findingSpan(finding);

    if (span === undefined) {
      /**
       * A file-level finding names no line, so it cannot be right or wrong about one.
       * Counting it as a match would let "something is wrong in db.ts" score as having
       * located a defect; counting it as a false positive would punish a claim that may
       * be perfectly true. It is reported as its own outcome and left to a person.
       */
      matches.push({
        index,
        outcome: candidates.length > 0 ? 'file_only' : 'unkeyed',
        file,
      });
      return;
    }

    const overlapping = candidates.filter((defect) =>
      overlaps(span, keyedSpan(defect)),
    );

    if (overlapping.length > 0) {
      const defect = best(overlapping, span);
      if (claimed.has(defect.id)) {
        matches.push({
          index,
          outcome: 'duplicate',
          file,
          defectId: defect.id,
        });
        return;
      }
      claimed.add(defect.id);
      matches.push({
        index,
        outcome: 'matched',
        file,
        defectId: defect.id,
        ...agreement(finding, defect),
      });
      return;
    }

    const nearest = candidates
      .map((defect) => ({ defect, gap: distance(span, keyedSpan(defect)) }))
      .filter((candidate) => candidate.gap <= NEAR_MISS_LINES)
      .sort((left, right) =>
        left.gap !== right.gap
          ? left.gap - right.gap
          : left.defect.id.localeCompare(right.defect.id),
      )[0];

    if (nearest) {
      matches.push({
        index,
        outcome: 'near_miss',
        file,
        defectId: nearest.defect.id,
        lineDistance: nearest.gap,
      });
      return;
    }

    matches.push({ index, outcome: 'unkeyed', file });
  });

  const missed = key.defects
    .map((defect) => defect.id)
    .filter((id) => !claimed.has(id));

  return { findings: matches, missed };
}

/** Counts by outcome, with every outcome present so a zero is visible rather than absent. */
export function countOutcomes(
  result: MatchResult,
): Record<MatchOutcome, number> {
  const counts = Object.fromEntries(
    MATCH_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<MatchOutcome, number>;
  for (const match of result.findings) counts[match.outcome] += 1;
  return counts;
}
