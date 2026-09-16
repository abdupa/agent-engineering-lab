export function validateEnvironment(env: Record<string, unknown>) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (
    typeof nodeEnv !== 'string' ||
    !['development', 'test', 'production'].includes(nodeEnv)
  ) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const rawPort = env.PORT ?? '3000';
  if (typeof rawPort !== 'string' && typeof rawPort !== 'number') {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const port = Number(rawPort);
  if (!/^\d+$/.test(String(rawPort)) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const host = env.HOST ?? '127.0.0.1';
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw new Error('HOST must be a non-empty string');
  }

  // Required by AuditModule, which fails startup without it. Shape is checked here so
  // an obviously wrong value is rejected with a clear message before module wiring.
  const auditRoot = env.AUDIT_ROOT;
  if (auditRoot !== undefined) {
    if (typeof auditRoot !== 'string' || auditRoot.trim().length === 0) {
      throw new Error('AUDIT_ROOT must be a non-empty absolute path');
    }
    if (!auditRoot.trim().startsWith('/')) {
      throw new Error('AUDIT_ROOT must be a non-empty absolute path');
    }
  }

  return { ...env, NODE_ENV: nodeEnv, HOST: host, PORT: port };
}
