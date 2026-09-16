import { AsyncLocalStorage } from 'node:async_hooks';

export interface UsageTotals {
  /** Completed provider requests, including those whose output was refused or invalid. */
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface CostRates {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
  readonly currency: string;
}

interface Accumulator {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Token accounting carried the same way correlation is: through AsyncLocalStorage, so
 * no domain contract grows a usage parameter to accommodate it.
 */
const usageScope = new AsyncLocalStorage<Accumulator>();

/**
 * Adds one provider call to the active scope. A no-op outside one, and it never throws —
 * accounting must not be able to fail a request it is only observing.
 */
export function recordUsage(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): void {
  const scope = usageScope.getStore();
  if (!scope) return;
  scope.calls += 1;
  scope.inputTokens += Number.isFinite(inputTokens) ? (inputTokens ?? 0) : 0;
  scope.outputTokens += Number.isFinite(outputTokens) ? (outputTokens ?? 0) : 0;
}

/** Totals so far in the active scope, or undefined when none is active. */
export function currentUsage(): UsageTotals | undefined {
  const scope = usageScope.getStore();
  return scope ? snapshot(scope) : undefined;
}

/** Runs work inside a fresh scope and returns its result alongside what it spent. */
export async function withUsage<T>(
  work: () => Promise<T>,
): Promise<{ result: T; usage: UsageTotals }> {
  const scope: Accumulator = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const result = await usageScope.run(scope, work);
  return { result, usage: snapshot(scope) };
}

function snapshot(scope: Accumulator): UsageTotals {
  return {
    calls: scope.calls,
    inputTokens: scope.inputTokens,
    outputTokens: scope.outputTokens,
    totalTokens: scope.inputTokens + scope.outputTokens,
  };
}

/**
 * Rates are supplied, never assumed.
 *
 * Provider pricing changes and differs per model, so a table hardcoded here would go
 * stale silently and report a confident wrong number. Unset rates mean cost is reported
 * as unavailable, which is true, rather than as an estimate, which would not be.
 */
export function costRatesFromEnv(
  env: Record<string, string | undefined>,
): CostRates | undefined {
  const input = parseRate(env.OPENAI_INPUT_COST_PER_MTOK);
  const output = parseRate(env.OPENAI_OUTPUT_COST_PER_MTOK);
  if (input === undefined || output === undefined) return undefined;
  const currency = (env.OPENAI_COST_CURRENCY ?? 'USD').trim();
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    currency: /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD',
  };
}

function parseRate(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Cost for the supplied totals at the supplied rates. Rounded to six decimals. */
export function estimateCost(totals: UsageTotals, rates: CostRates): number {
  const cost =
    (totals.inputTokens / 1_000_000) * rates.inputPerMillion +
    (totals.outputTokens / 1_000_000) * rates.outputPerMillion;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * A line suitable for printing to an operator. States plainly when cost is unavailable
 * rather than substituting a zero.
 */
export function describeUsage(
  totals: UsageTotals,
  rates: CostRates | undefined,
): string {
  const tokens =
    `${totals.calls} provider call(s), ` +
    `${totals.inputTokens} in + ${totals.outputTokens} out = ${totals.totalTokens} tokens`;
  if (!rates) {
    return `${tokens}. Cost unavailable: set OPENAI_INPUT_COST_PER_MTOK and OPENAI_OUTPUT_COST_PER_MTOK to price it.`;
  }
  return `${tokens}. Estimated cost ${estimateCost(totals, rates).toFixed(6)} ${rates.currency} at the rates you configured.`;
}
