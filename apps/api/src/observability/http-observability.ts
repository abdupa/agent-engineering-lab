import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestContext } from './request-context';

const logger = new Logger('HTTP');
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Install before Nest's body parser so invalid JSON receives correlation too.
export function httpObservability(
  request: IncomingMessage & { route?: { path?: unknown } },
  response: ServerResponse,
  next: () => void,
): void {
  const incoming = request.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && uuidPattern.test(incoming)
      ? incoming.toLowerCase()
      : randomUUID();
  const started = performance.now();
  response.setHeader('X-Request-ID', requestId);
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    response.off('finish', complete);
    response.off('close', complete);
    logger.log({
      event: 'http_completed',
      requestId,
      method: /^[A-Z]{1,20}$/.test(request.method ?? '')
        ? request.method
        : 'UNKNOWN',
      // Only matched route templates; never raw paths, query strings, or headers.
      route:
        typeof request.route?.path === 'string'
          ? request.route.path
          : 'unmatched',
      status: response.statusCode,
      durationMs: Math.max(0, performance.now() - started),
      outcome: response.writableFinished ? 'completed' : 'aborted',
    });
  };
  response.once('finish', complete);
  response.once('close', complete);
  requestContext.run({ requestId }, next);
}
