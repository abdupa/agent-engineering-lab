import { z } from 'zod';
import { ToolRegistry } from './tool-registry';
import { ToolExecutor } from './tool-executor';
import { ToolExecutionError } from './tool-execution.error';
import { addNumbersTool } from './add-numbers.tool';

function setup() {
  const registry = new ToolRegistry();
  const handler = jest.fn((input: string) => Promise.resolve(` ${input} `));
  registry.register({
    name: 'text',
    requiredPermissions: [],
    description: 'Test parsed input and output',
    inputSchema: z.string().trim().min(1),
    outputSchema: z.string().trim().min(1),
    execute: handler,
  });
  return { registry, handler, executor: new ToolExecutor(registry) };
}

describe('ToolExecutor', () => {
  it('passes parsed input once and returns parsed output', async () => {
    const { executor, handler } = setup();
    await expect(
      executor.execute('text', ' hello ', { grantedPermissions: [] }),
    ).resolves.toBe('hello');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
  });

  it('rejects unknown names without invoking another tool', async () => {
    const { executor, handler } = setup();
    await expect(executor.execute('private-name', 'secret')).rejects.toThrow(
      'Tool is not registered',
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([null, 42, '', '  '])(
    'rejects invalid input %j before invocation',
    async (input) => {
      const { executor, handler } = setup();
      await expect(
        executor.execute('text', input, { grantedPermissions: [] }),
      ).rejects.toThrow('Tool input validation failed');
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('rejects schema-invalid output without retrying', async () => {
    const { executor, handler } = setup();
    handler.mockResolvedValue(' ');
    await expect(
      executor.execute('text', 'hello', { grantedPermissions: [] }),
    ).rejects.toThrow('Tool output validation failed');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'reject'])(
    'sanitizes handler %s failures without retrying',
    async (mode) => {
      const { executor, handler } = setup();
      handler.mockImplementation(() => {
        if (mode === 'throw') throw new Error('private-handler-details');
        return Promise.reject(new Error('private-handler-details'));
      });
      const error: unknown = await executor
        .execute('text', 'private-input', { grantedPermissions: [] })
        .catch((error: unknown) => error);
      expect(error).toEqual(new ToolExecutionError('EXECUTION_FAILED'));
      expect(error).not.toHaveProperty('cause');
      expect(handler).toHaveBeenCalledTimes(1);
    },
  );

  it('supports async schema transformations and returns their parsed value', async () => {
    const registry = new ToolRegistry();
    const handler = jest.fn((input: number) =>
      Promise.resolve(` ${input + 1} `),
    );
    registry.register({
      name: 'async',
      requiredPermissions: [],
      description: 'Async input and output transformations',
      inputSchema: z
        .string()
        .transform((value) => Promise.resolve(value.length)),
      outputSchema: z
        .string()
        .transform((value) => Promise.resolve(value.trim())),
      execute: handler,
    });
    await expect(
      new ToolExecutor(registry).execute('async', 'abc', {
        grantedPermissions: [],
      }),
    ).resolves.toBe('4');
    expect(handler).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
  });

  it('sanitizes thrown schema callbacks without invoking the handler', async () => {
    const registry = new ToolRegistry();
    const handler = jest.fn((input: string) => Promise.resolve(input));
    registry.register({
      name: 'bad-schema',
      requiredPermissions: [],
      description: 'Throwing refinement',
      inputSchema: z.string().refine(() => {
        throw new Error('private-schema-details');
      }),
      outputSchema: z.string(),
      execute: handler,
    });
    await expect(
      new ToolExecutor(registry).execute('bad-schema', 'secret', {
        grantedPermissions: [],
      }),
    ).rejects.toThrow('Tool input validation failed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('executes the deterministic addition example through the registry', async () => {
    const registry = new ToolRegistry();
    registry.register(addNumbersTool);
    const executor = new ToolExecutor(registry);
    await expect(
      executor.execute(
        'add-numbers',
        { left: 2, right: 3, extra: true },
        { grantedPermissions: ['calculate'] },
      ),
    ).resolves.toBe(5);
    await expect(
      executor.execute(
        'add-numbers',
        { left: '2', right: 3 },
        { grantedPermissions: ['calculate'] },
      ),
    ).rejects.toThrow('Tool input validation failed');
    await expect(
      executor.execute(
        'add-numbers',
        {
          left: Number.MAX_VALUE,
          right: Number.MAX_VALUE,
        },
        { grantedPermissions: ['calculate'] },
      ),
    ).rejects.toThrow('Tool output validation failed');
  });
});
