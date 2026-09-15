import { z } from 'zod';
import type { Tool } from './tool';
import { ToolRegistry } from './tool-registry';

function textTool(name = 'text-length') {
  const execute = jest.fn((input: string) => Promise.resolve(input.length));
  return {
    name,
    requiredPermissions: [],
    description: 'Count characters in parsed text',
    inputSchema: z.string().trim().min(1),
    outputSchema: z.number().int().nonnegative(),
    execute,
  } satisfies Tool<string, number>;
}

describe('ToolRegistry', () => {
  it('starts empty and returns undefined for an unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.list()).toEqual([]);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('registers and discovers schemas and handlers without executing them', () => {
    const registry = new ToolRegistry();
    const tool = textTool();
    registry.register(tool);
    const found = registry.get(tool.name)!;
    expect(found).toEqual(tool);
    expect(found.inputSchema).toBe(tool.inputSchema);
    expect(found.outputSchema).toBe(tool.outputSchema);
    expect(found.inputSchema.parse(' text ')).toBe('text');
    expect(found.inputSchema.safeParse(42).success).toBe(false);
    expect(found.outputSchema.safeParse('4').success).toBe(false);
    expect(found.outputSchema.parse(4)).toBe(4);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('holds tools with different input and output types in registration order', () => {
    const registry = new ToolRegistry();
    const first = textTool();
    const second = {
      name: 'positive',
      requiredPermissions: [],
      description: 'Check whether a number is positive',
      inputSchema: z.number(),
      outputSchema: z.boolean(),
      execute: jest.fn((value: number) => Promise.resolve(value > 0)),
    } satisfies Tool<number, boolean>;
    registry.register(first);
    registry.register(second);
    expect(registry.list().map((tool) => tool.name)).toEqual([
      'text-length',
      'positive',
    ]);
    expect(second.execute).not.toHaveBeenCalled();
  });

  it('rejects duplicates without replacing the original or disclosing the name', () => {
    const registry = new ToolRegistry();
    const original = textTool('private-name');
    registry.register(original);
    expect(() => registry.register(textTool('private-name'))).toThrow(
      'Tool name is already registered',
    );
    expect(registry.get(original.name)?.execute).toBe(original.execute);
    expect(registry.list()).toHaveLength(1);
  });

  it.each(['', '  ', ' leading', 'trailing '])(
    'rejects invalid name %j',
    (name) => {
      const registry = new ToolRegistry();
      expect(() => registry.register(textTool(name))).toThrow(
        'Tool name must be non-empty with no surrounding whitespace',
      );
      expect(registry.list()).toEqual([]);
    },
  );

  it('rejects a blank description', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({ ...textTool(), description: ' ' }),
    ).toThrow('Tool description must be non-empty');
  });

  it('uses exact case-sensitive names, including ordinary object property names', () => {
    const registry = new ToolRegistry();
    registry.register(textTool('__proto__'));
    registry.register(textTool('Name'));
    registry.register(textTool('name'));
    expect(registry.get('__proto__')?.name).toBe('__proto__');
    expect(registry.get('NAME')).toBeUndefined();
    expect(registry.list()).toHaveLength(3);
  });

  it('keeps registered definitions stable and isolates list snapshots and instances', () => {
    const registry = new ToolRegistry();
    const tool = textTool();
    registry.register(tool);
    tool.name = 'changed';
    tool.description = 'changed';
    const snapshot = registry.list();
    registry.register(textTool('second'));
    expect(snapshot).toHaveLength(1);
    expect(registry.get('text-length')?.description).toBe(
      'Count characters in parsed text',
    );
    expect(registry.get('changed')).toBeUndefined();
    expect(Object.isFrozen(registry.get('text-length'))).toBe(true);
    expect(new ToolRegistry().list()).toEqual([]);
  });

  it('checks handler types and does not expose an unsafe generic lookup cast', () => {
    const registry = new ToolRegistry();
    const tool = textTool();
    registry.register(tool);
    const found = registry.get(tool.name)!;
    // This function is typechecked, never executed: discovery is not invocation.
    const compileTimeChecks = () => {
      // @ts-expect-error The typed handler requires string input.
      void tool.execute(42);
      // @ts-expect-error A dynamic lookup has not established the handler input type.
      void found.execute('text');
    };
    expect(compileTimeChecks).toBeDefined();
    expect(tool.execute).not.toHaveBeenCalled();
  });
});
