export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: Readonly<Record<string, boolean>>;
  readonly checkedAt: string;
}

export type HealthCheck = () => Promise<boolean>;

/**
 * Runs every registered check and reports the result.
 *
 * A check that throws counts as a failure rather than taking the report down with it,
 * because a health endpoint that cannot answer is worse than one answering "degraded".
 */
export async function checkHealth(
  checks: Readonly<Record<string, HealthCheck>>,
): Promise<HealthReport> {
  const entries = Object.entries(checks).sort(([a], [b]) => a.localeCompare(b));

  const results = await Promise.all(
    entries.map(async ([name, check]) => {
      try {
        return [name, await check()] as const;
      } catch {
        return [name, false] as const;
      }
    }),
  );

  return {
    status: results.every(([, passed]) => passed) ? 'ok' : 'degraded',
    checks: Object.fromEntries(results),
    checkedAt: new Date().toISOString(),
  };
}
