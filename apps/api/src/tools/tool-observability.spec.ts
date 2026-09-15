import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { requestContext } from '../observability/request-context';
import { ToolRegistry } from './tool-registry';
import { ToolExecutor } from './tool-executor';
import { ToolExecutionError } from './tool-execution.error';

const grants = { grantedPermissions: ['private-permission'] };

function setup(name = 'example') {
  const registry = new ToolRegistry();
  const handler = jest.fn((input: string) => Promise.resolve(input));
  registry.register({
    name,
    description: 'private-description',
    requiredPermissions: ['private-permission'],
    inputSchema: z.string().min(1),
    outputSchema: z.string().min(1),
    execute: handler,
  });
  return { executor: new ToolExecutor(registry, 10), handler };
}

describe('Tool execution observability', () => {
  let logs: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    logs = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records one correlated success with only allowlisted metadata', async () => {
    const { executor } = setup();
    await requestContext.run({ requestId: 'request-one' }, () =>
      executor.execute('example', 'private-input-output', grants),
    );
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith({
      event: 'tool_execution',
      requestId: 'request-one',
      tool: 'example',
      durationMs: expect.any(Number) as unknown,
      outcome: 'success',
    });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
  });

  it.each([
    'NOT_FOUND',
    'DENIED',
    'INVALID_INPUT',
    'EXECUTION_FAILED',
    'INVALID_OUTPUT',
    'TIMEOUT',
  ])('records normalized %s without changing the failure', async (code) => {
    const { executor, handler } = setup();
    if (code === 'EXECUTION_FAILED')
      handler.mockRejectedValue(new Error('private-error'));
    if (code === 'INVALID_OUTPUT') handler.mockResolvedValue('');
    if (code === 'TIMEOUT')
      handler.mockImplementation(() => new Promise<string>(() => undefined));
    const result = executor
      .execute(
        code === 'NOT_FOUND' ? 'private-missing-name' : 'example',
        code === 'INVALID_INPUT' ? null : 'private-input',
        code === 'DENIED' ? undefined : grants,
      )
      .catch((error: unknown) => error);
    if (code === 'TIMEOUT') await jest.advanceTimersByTimeAsync(10);
    expect(await result).toBeInstanceOf(ToolExecutionError);
    expect(await result).toMatchObject({ code });
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith({
      event: 'tool_execution',
      tool: code === 'NOT_FOUND' ? '[unregistered]' : 'example',
      durationMs: expect.any(Number) as unknown,
      outcome: 'failure',
      code,
    });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('private-');
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['private-name\nsecret', 'sk-private-key', 'x'.repeat(129)])(
    'redacts unsafe registered name %s without rejecting execution',
    async (name) => {
      const { executor } = setup(name);
      await expect(
        executor.execute(name, 'private-output', grants),
      ).resolves.toBe('private-output');
      expect(logs).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: '[invalid-tool-name]',
          outcome: 'success',
        }),
      );
      expect(JSON.stringify(logs.mock.calls)).not.toContain(name);
    },
  );

  it('isolates concurrent correlation and omits IDs outside request context', async () => {
    const { executor } = setup();
    await Promise.all(
      ['one', 'two'].map((requestId) =>
        requestContext.run({ requestId }, () =>
          executor.execute('example', 'value', grants),
        ),
      ),
    );
    await executor.execute('example', 'value', grants);
    expect(logs).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requestId: 'one' }),
    );
    expect(logs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: 'two' }),
    );
    const calls = logs.mock.calls as unknown[][];
    expect(calls[2]?.[0]).not.toHaveProperty('requestId');
    expect(requestContext.getStore()).toBeUndefined();
  });

  it('does not emit a second summary when ignored cancellation later completes', async () => {
    const { executor, handler } = setup();
    let finish!: (value: string) => void;
    handler.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const result = executor
      .execute('example', 'private-input', grants)
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    finish('private-late-output');
    await jest.runAllTimersAsync();
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TIMEOUT', durationMs: 10 }),
    );
  });

  it('preserves success and denial if logging throws', async () => {
    const { executor } = setup();
    logs.mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    await expect(executor.execute('example', 'value', grants)).resolves.toBe(
      'value',
    );
    await expect(executor.execute('example', 'value')).rejects.toMatchObject({
      code: 'DENIED',
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
