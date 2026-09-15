import { z } from 'zod';
import type { ToolExecutionContext } from './tool';
import { ToolRegistry } from './tool-registry';
import { ToolExecutor } from './tool-executor';
import { addNumbersTool } from './add-numbers.tool';

const grants = { grantedPermissions: ['calculate'] };

describe('Tool reliability and policy', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([
    undefined,
    { grantedPermissions: [] },
    { grantedPermissions: ['other'] },
  ])('denies missing grants before parsing or invoking', async (context) => {
    const registry = new ToolRegistry();
    const parse = jest.fn((value: string) => value);
    const execute = jest.fn((value: string) => Promise.resolve(value));
    registry.register({
      name: 'protected',
      description: 'Test',
      requiredPermissions: ['calculate'],
      inputSchema: z.string().transform(parse),
      outputSchema: z.string(),
      execute,
    });
    await expect(
      new ToolExecutor(registry).execute('protected', 'secret', context),
    ).rejects.toMatchObject({ code: 'DENIED' });
    expect(parse).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('requires all permissions and snapshots registry metadata', async () => {
    const registry = new ToolRegistry();
    const requiredPermissions = ['calculate', 'second'];
    registry.register({ ...addNumbersTool, requiredPermissions });
    requiredPermissions.pop();
    const executor = new ToolExecutor(registry);
    await expect(
      executor.execute('add-numbers', { left: 1, right: 2 }, grants),
    ).rejects.toMatchObject({ code: 'DENIED' });
    await expect(
      executor.execute(
        'add-numbers',
        { left: 1, right: 2 },
        { grantedPermissions: ['second', 'calculate', 'extra'] },
      ),
    ).resolves.toBe(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('requires a context even for tools with no required permissions', async () => {
    const registry = new ToolRegistry();
    registry.register({ ...addNumbersTool, requiredPermissions: [] });
    const executor = new ToolExecutor(registry);
    await expect(
      executor.execute('add-numbers', { left: 1, right: 2 }),
    ).rejects.toMatchObject({ code: 'DENIED' });
    await expect(
      executor.execute(
        'add-numbers',
        { left: 1, right: 2 },
        { grantedPermissions: [] },
      ),
    ).resolves.toBe(3);
  });

  it.each(['input', 'handler', 'output'])(
    'bounds asynchronous %s work and prevents later stages',
    async (stage) => {
      const registry = new ToolRegistry();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const outputParse = jest.fn(async (value: string) => {
        if (stage === 'output') await pending;
        return value;
      });
      let signal: AbortSignal | undefined;
      const handler = jest.fn(
        async (value: string, context: ToolExecutionContext) => {
          signal = context.signal;
          if (stage === 'handler') await pending;
          return value;
        },
      );
      registry.register({
        name: 'slow',
        description: 'Test',
        requiredPermissions: [],
        inputSchema: z.string().transform(async (value) => {
          if (stage === 'input') await pending;
          return value;
        }),
        outputSchema: z.string().transform(outputParse),
        execute: handler,
      });
      const result = new ToolExecutor(registry)
        .execute('slow', 'secret', { grantedPermissions: [] })
        .catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(4999);
      if (signal) expect(signal.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({ code: 'TIMEOUT' });
      if (signal) expect(signal.aborted).toBe(true);
      release();
      await jest.runAllTimersAsync();
      expect(handler).toHaveBeenCalledTimes(stage === 'input' ? 0 : 1);
      expect(outputParse).toHaveBeenCalledTimes(stage === 'output' ? 1 : 0);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('delivers cooperative cancellation and normalizes abort rejection as timeout', async () => {
    const registry = new ToolRegistry();
    const aborted = jest.fn();
    registry.register({
      name: 'wait',
      description: 'Test',
      requiredPermissions: [],
      inputSchema: z.string(),
      outputSchema: z.string(),
      execute: (_input: string, context: ToolExecutionContext) =>
        new Promise<string>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              aborted();
              reject(new Error('private-abort'));
            },
            { once: true },
          );
        }),
    });
    const result = new ToolExecutor(registry, 20)
      .execute('wait', 'secret', { grantedPermissions: [] })
      .catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(20);
    expect(await result).toMatchObject({
      code: 'TIMEOUT',
      message: 'Tool execution timed out',
    });
    expect(await result).not.toHaveProperty('cause');
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_648])(
    'rejects invalid timeout %s',
    (timeout) => {
      expect(() => new ToolExecutor(new ToolRegistry(), timeout)).toThrow(
        'Tool timeout',
      );
    },
  );

  it('normalizes output violations and clears the timer', async () => {
    const registry = new ToolRegistry();
    registry.register(addNumbersTool);
    await expect(
      new ToolExecutor(registry).execute(
        'add-numbers',
        { left: Number.MAX_VALUE, right: Number.MAX_VALUE },
        grants,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(jest.getTimerCount()).toBe(0);
  });
  it('isolates signals for concurrent calls and snapshots grants', async () => {
    const registry = new ToolRegistry();
    const signals: AbortSignal[] = [];
    const observed: (readonly string[])[] = [];
    registry.register({
      name: 'concurrent',
      description: 'Test isolation',
      requiredPermissions: ['calculate'],
      inputSchema: z.string(),
      outputSchema: z.string(),
      execute: (input: string, context: ToolExecutionContext) => {
        signals.push(context.signal);
        observed.push(context.grantedPermissions);
        return input === 'fast'
          ? Promise.resolve(input)
          : new Promise<string>(() => undefined);
      },
    });
    const executor = new ToolExecutor(registry, 10);
    const mutable = { grantedPermissions: ['calculate'] };
    const slow = executor
      .execute('concurrent', 'slow', mutable)
      .catch((error: unknown) => error);
    mutable.grantedPermissions.length = 0;
    await expect(executor.execute('concurrent', 'fast', grants)).resolves.toBe(
      'fast',
    );
    await jest.advanceTimersByTimeAsync(10);
    expect(await slow).toMatchObject({ code: 'TIMEOUT' });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(observed).toEqual([['calculate'], ['calculate']]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
