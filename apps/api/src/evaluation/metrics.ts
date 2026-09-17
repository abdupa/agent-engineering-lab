import type { AnswerKey } from './answer-key.schema';
import type { RunRecord } from './run-record.schema';
import {
  countOutcomes,
  matchFindings,
  type MatchOutcome,
  type MatchResult,
} from './match';
import type { RunLabel, Verdict } from './run-label.schema';

/**
 * Turns a matched run into numbers.
 *
 * Two rules run through everything here.
 *
 * **Every rate carries its denominator.** A rate is a fraction, not a percentage, and the
 * percentage is derived from it. One correct finding out of one is 100% and is also a
 * sample of one, and only the denominator says so. Reporting the percentage alone is the
 * cheapest way to make three anecdotes look like evidence.
 *
 * **A rate that cannot be computed is absent, not zero.** No findings means precision is
 * unmeasurable rather than nil; a key that does not claim to be exhaustive cannot classify
 * its unmatched findings at all. Substituting zero would be a claim about the agent that
 * the data does not support, which is the same failure `unscoreable` prevents at load.
 *
 * There is deliberately no single score. A release that exists to stop one number hiding
 * the truth does not end by producing one number.
 */

export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
  /** Absent when the denominator is zero. Nothing divided by nothing is not zero. */
  readonly value?: number;
}

function rate(numerator: number, denominator: number): Rate {
  return denominator === 0
    ? { numerator, denominator }
    : { numerator, denominator, value: numerator / denominator };
}

/** `2/3 (67%)`, or `0/0 (not measurable)`. Never a bare percentage. */
export function formatRate(value: Rate): string {
  const fraction = `${value.numerator}/${value.denominator}`;
  return value.value === undefined
    ? `${fraction} (not measurable)`
    : `${fraction} (${Math.round(value.value * 100)}%)`;
}

export interface SeverityAgreement {
  readonly exact: number;
  /** The finding rated it more serious than the key does. */
  readonly over: number;
  readonly under: number;
  /** Exact agreements over matched findings. */
  readonly agreement: Rate;
  /**
   * Mean signed rank difference across matched findings. Positive means the agent inflates.
   * Absent when nothing matched.
   *
   * Signed rather than absolute on purpose: run 11 was consistently two ranks high, and an
   * absolute mean would report the same figure for an agent that inflated half its findings
   * and understated the other half — a different problem with a different fix.
   */
  readonly meanSignedDelta?: number;
}

export interface CostSummary {
  readonly totalTokens: number;
  readonly providerCalls: number;
  /** Absent when the run spent nothing, as run 9 did. */
  readonly locatedDefectsPer10kTokens?: number;
  /** Absent when the run located nothing, which is most of the stored corpus. */
  readonly tokensPerLocatedDefect?: number;
}

export interface Scorecard {
  readonly runId: string;
  readonly model: string;
  readonly outcome: RunRecord['outcome'];
  readonly target: string;
  readonly keyVersion: number;
  readonly exhaustive: boolean;

  readonly findings: number;
  readonly keyedDefects: number;
  readonly outcomes: Record<MatchOutcome, number>;

  /** Keyed defects a finding located, over all keyed defects. */
  readonly recall: Rate;
  /** Absent when the key cannot classify what the run produced. */
  readonly precision?: Rate;
  /** Why precision is absent. Present exactly when `precision` is not. */
  readonly precisionUnavailable?: string;
  /**
   * Of the findings that reached a real defect, how many cited a line inside it.
   *
   * The metric run 11 was about, and computable whether or not the key is exhaustive,
   * because it only ever looks at findings already known to be about something real.
   */
  readonly citationAccuracy: Rate;
  /** Findings on files the key vouches for, over all findings. */
  readonly controlFalseAlarms: Rate;
  readonly duplicateRate: Rate;

  readonly severity: SeverityAgreement;
  readonly cost: CostSummary;

  /** Keyed defects nothing located. */
  readonly missed: readonly string[];
  /**
   * Findings on files the key has never heard of. A run where this equals the finding
   * count was probably pointed at the wrong tree, and the numbers below it are about
   * nothing. Reported as a count rather than a verdict.
   */
  readonly findingsOnUnknownFiles: number;
}

/**
 * Which findings precision is allowed to judge.
 *
 * Excluded, with reasons, because dropping things from a denominator is exactly how a
 * metric becomes flattering:
 *
 * - `duplicate` — repeating a correct finding is noise, not an error. It is wrong in
 *   neither direction, and `duplicateRate` measures it separately rather than letting it
 *   dilute correctness.
 * - `file_only` — a finding citing no line cannot be right or wrong about one. Counting it
 *   either way would invent a judgement nobody made; it is surfaced for a person instead.
 * - `unkeyed`, when the key is not exhaustive — genuinely unknown. Run 5 found two real
 *   defects in this repository that nobody had planted.
 *
 * `near_miss` is **not** excluded and counts against precision. A claim attached to the
 * wrong line is worse than no finding, because a reviewer cannot tell it is wrong without
 * rechecking the file themselves — which is the work the finding was supposed to save.
 */
function precisionOf(
  outcomes: Record<MatchOutcome, number>,
  exhaustive: boolean,
): { precision?: Rate; precisionUnavailable?: string } {
  const judged =
    outcomes.matched + outcomes.near_miss + (exhaustive ? outcomes.unkeyed : 0);

  if (!exhaustive && outcomes.unkeyed > 0) {
    return {
      precisionUnavailable: `${outcomes.unkeyed} finding(s) match no keyed defect and the key does not claim to list every defect, so they are unclassified rather than wrong`,
    };
  }

  if (judged === 0) {
    return {
      precisionUnavailable:
        'no finding reached a state precision can judge — nothing to be right or wrong about',
    };
  }

  return { precision: rate(outcomes.matched, judged) };
}

function severityOf(result: MatchResult): SeverityAgreement {
  const matched = result.findings.filter(
    (match) => match.outcome === 'matched',
  );
  const counts = { exact: 0, over: 0, under: 0 };
  let total = 0;

  for (const match of matched) {
    if (match.severityAgreement) counts[match.severityAgreement] += 1;
    total += match.severityDelta ?? 0;
  }

  return {
    ...counts,
    agreement: rate(counts.exact, matched.length),
    ...(matched.length > 0 ? { meanSignedDelta: total / matched.length } : {}),
  };
}

function costOf(record: RunRecord, located: number): CostSummary {
  const { totalTokens, calls } = record.usage;
  return {
    totalTokens,
    providerCalls: calls,
    ...(totalTokens > 0
      ? { locatedDefectsPer10kTokens: (located / totalTokens) * 10_000 }
      : {}),
    ...(located > 0 ? { tokensPerLocatedDefect: totalTokens / located } : {}),
  };
}

/** Scores one recorded run against one key. Pure: no I/O, no clock, no network. */
export function scoreRun(record: RunRecord, key: AnswerKey): Scorecard {
  const result = matchFindings(record.findings, key);
  const outcomes = countOutcomes(result);
  const located = outcomes.matched;

  return {
    runId: record.runId,
    model: record.model,
    outcome: record.outcome,
    target: key.target,
    keyVersion: key.version,
    exhaustive: key.exhaustive,

    findings: record.findings.length,
    keyedDefects: key.defects.length,
    outcomes,

    recall: rate(located, key.defects.length),
    ...precisionOf(outcomes, key.exhaustive),
    citationAccuracy: rate(located, located + outcomes.near_miss),
    controlFalseAlarms: rate(
      result.findings.filter((match) => match.file === 'keyed_clean').length,
      record.findings.length,
    ),
    duplicateRate: rate(outcomes.duplicate, record.findings.length),

    severity: severityOf(result),
    cost: costOf(record, located),

    missed: result.missed,
    findingsOnUnknownFiles: result.findings.filter(
      (match) => match.file === 'unknown',
    ).length,
  };
}

/**
 * What the matching rule would call each verdict a person recorded.
 *
 * `unverifiable` maps to nothing: the person could not decide, so there is no judgement to
 * agree or disagree with, and it is excluded from the comparison rather than counted as a
 * disagreement.
 */
const EXPECTED_OUTCOME: Record<Verdict, MatchOutcome | undefined> = {
  correct: 'matched',
  mislocated: 'near_miss',
  false: 'unkeyed',
  unverifiable: undefined,
};

export interface RuleDisagreement {
  readonly index: number;
  readonly verdict: Verdict;
  readonly outcome: MatchOutcome;
  readonly note: string;
}

export interface RuleAgreement {
  /** Verdicts the rule reproduced, over verdicts it could be compared against. */
  readonly agreement: Rate;
  readonly compared: number;
  readonly skipped: number;
  readonly disagreements: readonly RuleDisagreement[];
}

/**
 * Measures the matching rule against the person who read the findings.
 *
 * This is the instrument checking itself. Every other number here describes the agent; this
 * one describes whether the thing producing those numbers agrees with the judgement it is
 * standing in for. A rule that scores highly while disagreeing with every human reading is
 * measuring something, but not what anybody asked for.
 *
 * It is reported and never used to adjust the rule. Tuning a rule until it agrees with the
 * run it was built from stops it predicting anything about the next one.
 */
export function compareToLabels(
  result: MatchResult,
  label: RunLabel,
): RuleAgreement {
  const byIndex = new Map(
    result.findings.map((match) => [match.index, match] as const),
  );

  let compared = 0;
  let skipped = 0;
  const disagreements: RuleDisagreement[] = [];

  for (const verdict of label.verdicts) {
    const expected = EXPECTED_OUTCOME[verdict.verdict];
    const match = byIndex.get(verdict.index);

    if (expected === undefined || match === undefined) {
      skipped += 1;
      continue;
    }

    compared += 1;
    if (match.outcome !== expected) {
      disagreements.push({
        index: verdict.index,
        verdict: verdict.verdict,
        outcome: match.outcome,
        note: verdict.note,
      });
    }
  }

  return {
    agreement: rate(compared - disagreements.length, compared),
    compared,
    skipped,
    disagreements,
  };
}

/** Scores a labeled run and reports how far the rule agreed with the person. */
export function scoreLabeledRun(
  record: RunRecord,
  label: RunLabel,
): { readonly scorecard: Scorecard; readonly ruleAgreement: RuleAgreement } {
  return {
    scorecard: scoreRun(record, label.key),
    ruleAgreement: compareToLabels(
      matchFindings(record.findings, label.key),
      label,
    ),
  };
}
