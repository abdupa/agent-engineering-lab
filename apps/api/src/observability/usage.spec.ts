import {
  costRatesFromEnv,
  currentUsage,
  describeUsage,
  estimateCost,
  recordUsage,
  withUsage,
} from './usage';
import type { CostRates, UsageTotals } from './usage';

const totals = (input: number, output: number, calls = 1): UsageTotals => ({
  calls,
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
});

describe('recording usage', () => {
  it('is a no-op outside a scope and never throws', () => {
    expect(() => recordUsage(100, 20)).not.toThrow();
    expect(currentUsage()).toBeUndefined();
  });

  it('accumulates every call inside a scope', async () => {
    const { usage } = await withUsage(() => {
      recordUsage(100, 20);
      recordUsage(250, 30);
      return Promise.resolve(null);
    });
    expect(usage).toEqual(totals(350, 50, 2));
  });

  it('counts a call whose token figures are missing', async () => {
    // A billed request with no usage block still happened; dropping it would hide spend.
    const { usage } = await withUsage(() => {
      recordUsage(undefined, undefined);
      return Promise.resolve(null);
    });
    expect(usage).toEqual(totals(0, 0, 1));
  });

  it.each([
    [Number.NaN, 5],
    [5, Number.POSITIVE_INFINITY],
  ])('ignores the non-finite figures %p and %p', async (input, output) => {
    const { usage } = await withUsage(() => {
      recordUsage(input, output);
      return Promise.resolve(null);
    });
    expect(usage.inputTokens + usage.outputTokens).toBe(
      Number.isFinite(input) ? input : Number.isFinite(output) ? output : 0,
    );
  });

  it('keeps concurrent scopes separate', async () => {
    const [a, b] = await Promise.all([
      withUsage(async () => {
        await Promise.resolve();
        recordUsage(10, 1);
        return null;
      }),
      withUsage(async () => {
        recordUsage(500, 50);
        await Promise.resolve();
        return null;
      }),
    ]);
    expect(a.usage).toEqual(totals(10, 1));
    expect(b.usage).toEqual(totals(500, 50));
  });

  it('returns the work result alongside the usage', async () => {
    const { result } = await withUsage(() => Promise.resolve('done'));
    expect(result).toBe('done');
  });

  it('exposes running totals while work is still in flight', async () => {
    await withUsage(() => {
      recordUsage(7, 3);
      expect(currentUsage()).toEqual(totals(7, 3));
      return Promise.resolve(null);
    });
  });
});

describe('cost rates', () => {
  it('is unavailable unless both rates are configured', () => {
    expect(costRatesFromEnv({})).toBeUndefined();
    expect(
      costRatesFromEnv({ OPENAI_INPUT_COST_PER_MTOK: '1.25' }),
    ).toBeUndefined();
    expect(
      costRatesFromEnv({ OPENAI_OUTPUT_COST_PER_MTOK: '10' }),
    ).toBeUndefined();
  });

  it.each([['abc'], ['-1'], [''], ['  ']])(
    'rejects the invalid rate %p rather than treating it as zero',
    (bad) => {
      expect(
        costRatesFromEnv({
          OPENAI_INPUT_COST_PER_MTOK: bad,
          OPENAI_OUTPUT_COST_PER_MTOK: '10',
        }),
      ).toBeUndefined();
    },
  );

  it('reads both rates and a currency', () => {
    expect(
      costRatesFromEnv({
        OPENAI_INPUT_COST_PER_MTOK: '1.25',
        OPENAI_OUTPUT_COST_PER_MTOK: '10',
        OPENAI_COST_CURRENCY: 'eur',
      }),
    ).toEqual({
      inputPerMillion: 1.25,
      outputPerMillion: 10,
      currency: 'EUR',
    });
  });

  it('falls back to USD for a malformed currency', () => {
    expect(
      costRatesFromEnv({
        OPENAI_INPUT_COST_PER_MTOK: '1',
        OPENAI_OUTPUT_COST_PER_MTOK: '2',
        OPENAI_COST_CURRENCY: 'dollars',
      })?.currency,
    ).toBe('USD');
  });
});

describe('estimating cost', () => {
  const rates: CostRates = {
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    currency: 'USD',
  };

  it('prices input and output separately', () => {
    // 1,000,000 in at 1.25 plus 100,000 out at 10 per million = 1.25 + 1.00
    expect(estimateCost(totals(1_000_000, 100_000), rates)).toBe(2.25);
  });

  it('is zero for no usage', () => {
    expect(estimateCost(totals(0, 0, 0), rates)).toBe(0);
  });
});

describe('describing usage to an operator', () => {
  it('says cost is unavailable rather than printing zero', () => {
    const line = describeUsage(totals(100, 20), undefined);
    expect(line).toContain('120 tokens');
    expect(line).toContain('Cost unavailable');
    expect(line).not.toMatch(/0\.000000/);
  });

  it('attributes the figure to the configured rates', () => {
    const line = describeUsage(totals(1_000_000, 100_000), {
      inputPerMillion: 1.25,
      outputPerMillion: 10,
      currency: 'USD',
    });
    expect(line).toContain('2.250000 USD');
    expect(line).toContain('rates you configured');
  });
});
