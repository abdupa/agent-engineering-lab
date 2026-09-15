import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export const providerExecution = new AsyncLocalStorage<{
  requestId?: string;
  provider: string;
  model: string;
  attempt: number;
}>();
const logger = new Logger('OpenAIModelProvider');

// A transparent fetch hook: never read payloads or change SDK retry/abort behavior.
export function observeOpenAIFetch(transport: typeof fetch): typeof fetch {
  return async (url, options) => {
    const execution = providerExecution.getStore();
    if (!execution) return transport(url, options);
    const attempt = ++execution.attempt;
    const started = performance.now();
    let outcome = 'transport_error';
    let code: string | undefined;
    let status: number | undefined;
    try {
      const response = await transport(url, options);
      status = response.status;
      outcome = response.ok ? 'response_received' : 'http_error';
      if (!response.ok) {
        code =
          response.status === 408
            ? 'TIMEOUT'
            : response.status === 409 ||
                response.status === 429 ||
                response.status >= 500
              ? 'UNAVAILABLE'
              : 'CONFIGURATION';
      }
      return response;
    } catch (error) {
      code = options?.signal?.aborted ? 'TIMEOUT' : 'UNAVAILABLE';
      throw error;
    } finally {
      logger.log({
        event: 'provider_attempt',
        ...execution,
        attempt,
        durationMs: Math.max(0, performance.now() - started),
        outcome,
        ...(status === undefined ? {} : { status }),
        ...(code === undefined ? {} : { code }),
      });
    }
  };
}
