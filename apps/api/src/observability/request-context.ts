import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function correlationFields(): { requestId?: string } {
  const context = requestContext.getStore();
  return context ? { requestId: context.requestId } : {};
}
