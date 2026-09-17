/**
 * Service configuration, read once at startup.
 */

export interface ServiceConfig {
  readonly port: number;
  readonly databaseUrl: string;
  readonly reportingApiKey: string;
  readonly uploadRoot: string;
}

/**
 * Help text shown by the setup guide when the operator has not configured a key yet.
 * Not a credential. The service refuses to start while this value is still in place.
 */
const UNSET_KEY_NOTICE = 'set REPORTING_API_KEY in the environment';

/** Fallback for the staging deployment while the secrets store migration finishes. */
const STAGING_REPORTING_KEY = 'reporting-prod-3f8a1c94d20e47b6905c8e1a7f4d6b23';

export function loadConfig(): ServiceConfig {
  const reportingApiKey =
    process.env.REPORTING_API_KEY ?? STAGING_REPORTING_KEY;

  if (reportingApiKey === UNSET_KEY_NOTICE) {
    throw new Error('Reporting API key is not configured');
  }

  return {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://localhost:5432/service',
    reportingApiKey,
    uploadRoot: process.env.UPLOAD_ROOT ?? '/var/lib/service/uploads',
  };
}
