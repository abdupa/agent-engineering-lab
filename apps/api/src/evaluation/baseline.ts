import type { Rate, RuleAgreement, Scorecard } from './metrics';

/**
 * What the scorer currently produces for the frozen corpus, committed so that a change to
 * it has to be a commit somebody wrote a reason for.
 *
 * The stored records never change and the labels are reviewed like fixtures, so a score is
 * a pure function of those two things and the code. **Any** difference therefore means the
 * code changed, which is why this pins exact values rather than setting a floor.
 *
 * That catches the regression the SPEC calls the worst one: a metric moving while no record
 * moved. A floor would let the scorer quietly become more generous — every number would
 * rise, the gate would stay green, and the improvement would be in the instrument rather
 * than the agent.
 *
 * An improvement fails the gate too, deliberately. Nothing here can tell a better rule from
 * a looser one, so both arrive as "this changed, say why", and the reason ends up in a
 * commit message instead of nowhere.
 *
 * Rates are stored as fractions and compared as integers. No float is ever compared, which
 * removes a class of flakiness rather than managing it.
 */

export interface BaselineRate {
  readonly numerator: number;
  readonly denominator: number;
}

export interface BaselineEntry {
  readonly file: string;
  readonly scoredAgainst: string;
  readonly findings: number;
  readonly keyedDefects: number;
  readonly outcomes: Record<string, number>;
  readonly recall: BaselineRate;
  /** Null when the key could not classify what the run produced. Never omitted. */
  readonly precision: BaselineRate | null;
  readonly citationAccuracy: BaselineRate;
  readonly controlFalseAlarms: BaselineRate;
  readonly duplicateRate: BaselineRate;
  readonly severityAgreement: BaselineRate;
  /** Null when nothing matched. Positive means the agent inflates. */
  readonly severityMeanSignedDelta: number | null;
  /** From the record, so a stored record edited after the fact also trips the gate. */
  readonly totalTokens: number;
  /** How far the matching rule agreed with the person. Null when scored against a target. */
  readonly ruleAgreement: BaselineRate | null;
}

export interface Baseline {
  readonly generatedOn: string;
  readonly note: string;
  readonly runs: Readonly<Record<string, BaselineEntry>>;
}

/** Whether a larger fraction is a better result, per measure. */
const HIGHER_IS_BETTER: Readonly<Record<string, boolean>> = {
  recall: true,
  precision: true,
  citationAccuracy: true,
  severityAgreement: true,
  ruleAgreement: true,
  controlFalseAlarms: false,
  duplicateRate: false,
};

function fraction(value: Rate): BaselineRate {
  return { numerator: value.numerator, denominator: value.denominator };
}

/** Projects a scorecard into the committed shape. Drops the floats on purpose. */
export function toBaselineEntry(
  card: Scorecard,
  file: string,
  scoredAgainst: string,
  ruleAgreement?: RuleAgreement,
): BaselineEntry {
  return {
    file,
    scoredAgainst,
    findings: card.findings,
    keyedDefects: card.keyedDefects,
    outcomes: { ...card.outcomes },
    recall: fraction(card.recall),
    precision: card.precision ? fraction(card.precision) : null,
    citationAccuracy: fraction(card.citationAccuracy),
    controlFalseAlarms: fraction(card.controlFalseAlarms),
    duplicateRate: fraction(card.duplicateRate),
    severityAgreement: fraction(card.severity.agreement),
    severityMeanSignedDelta: card.severity.meanSignedDelta ?? null,
    totalTokens: card.cost.totalTokens,
    ruleAgreement: ruleAgreement ? fraction(ruleAgreement.agreement) : null,
  };
}

export type Direction = 'better' | 'worse' | 'changed';

export interface BaselineDifference {
  readonly runId: string;
  readonly measure: string;
  readonly was: string;
  readonly now: string;
  readonly direction: Direction;
}

/** Compares two fractions without dividing. a/b vs c/d is a*d vs c*b. */
function compareFractions(left: BaselineRate, right: BaselineRate): number {
  if (left.denominator === 0 || right.denominator === 0) {
    // One of them is not measurable, so there is no ordering. Any difference is a change.
    return Number.NaN;
  }
  return (
    left.numerator * right.denominator - right.numerator * left.denominator
  );
}

function show(value: BaselineRate | number | null): string {
  if (value === null) return 'n/a';
  return typeof value === 'number'
    ? String(value)
    : `${value.numerator}/${value.denominator}`;
}

function rateDifference(
  runId: string,
  measure: string,
  was: BaselineRate | null,
  now: BaselineRate | null,
): BaselineDifference | undefined {
  if (was === null && now === null) return undefined;
  if (was === null || now === null) {
    return {
      runId,
      measure,
      was: show(was),
      now: show(now),
      direction: 'changed',
    };
  }
  if (was.numerator === now.numerator && was.denominator === now.denominator) {
    return undefined;
  }

  const order = compareFractions(now, was);
  const higherBetter = HIGHER_IS_BETTER[measure];
  const direction: Direction =
    Number.isNaN(order) || order === 0 || higherBetter === undefined
      ? 'changed'
      : order > 0 === higherBetter
        ? 'better'
        : 'worse';

  return { runId, measure, was: show(was), now: show(now), direction };
}

/**
 * Every way the current scores differ from the committed baseline.
 *
 * Missing and unexpected runs are differences too. A run silently dropping out of the
 * corpus would otherwise make the gate pass by measuring less, which is the failure mode of
 * every test suite that quietly stops running.
 */
export function compareToBaseline(
  current: Readonly<Record<string, BaselineEntry>>,
  baseline: Baseline,
): BaselineDifference[] {
  const differences: BaselineDifference[] = [];

  for (const runId of Object.keys(baseline.runs)) {
    if (!(runId in current)) {
      differences.push({
        runId,
        measure: 'presence',
        was: 'scored',
        now: 'missing',
        direction: 'changed',
      });
    }
  }

  for (const [runId, now] of Object.entries(current)) {
    const was = baseline.runs[runId];
    if (!was) {
      differences.push({
        runId,
        measure: 'presence',
        was: 'not in baseline',
        now: 'scored',
        direction: 'changed',
      });
      continue;
    }

    for (const measure of [
      'recall',
      'precision',
      'citationAccuracy',
      'controlFalseAlarms',
      'duplicateRate',
      'severityAgreement',
      'ruleAgreement',
    ] as const) {
      const difference = rateDifference(
        runId,
        measure,
        was[measure],
        now[measure],
      );
      if (difference) differences.push(difference);
    }

    for (const measure of [
      'findings',
      'keyedDefects',
      'totalTokens',
      'severityMeanSignedDelta',
    ] as const) {
      if (was[measure] !== now[measure]) {
        differences.push({
          runId,
          measure,
          was: show(was[measure]),
          now: show(now[measure]),
          direction: 'changed',
        });
      }
    }

    for (const outcome of new Set([
      ...Object.keys(was.outcomes),
      ...Object.keys(now.outcomes),
    ])) {
      if (was.outcomes[outcome] !== now.outcomes[outcome]) {
        differences.push({
          runId,
          measure: `outcomes.${outcome}`,
          was: show(was.outcomes[outcome] ?? null),
          now: show(now.outcomes[outcome] ?? null),
          direction: 'changed',
        });
      }
    }
  }

  return differences;
}

/** A message an operator can act on without opening the baseline file. */
export function describeDifferences(
  differences: readonly BaselineDifference[],
): string {
  if (differences.length === 0) return 'scores match the committed baseline';

  const lines = differences.map(
    (difference) =>
      `  ${difference.runId.slice(0, 8)} ${difference.measure}: ${difference.was} -> ${difference.now} (${difference.direction})`,
  );

  return [
    `${differences.length} difference(s) from the committed baseline:`,
    ...lines,
    '',
    'If this change is intended, regenerate the baseline and say why in the commit:',
    '  pnpm score:runs --update-baseline',
  ].join('\n');
}
