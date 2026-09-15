import type { RegisteredTool, Tool } from './tool';

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register<Input, Output>(tool: Tool<Input, Output>): void {
    if (!tool.name.trim() || tool.name !== tool.name.trim()) {
      throw new Error(
        'Tool name must be non-empty with no surrounding whitespace',
      );
    }
    if (!tool.description.trim()) {
      throw new Error('Tool description must be non-empty');
    }
    if (
      !Array.isArray(tool.requiredPermissions) ||
      tool.requiredPermissions.some(
        (permission: unknown) =>
          typeof permission !== 'string' ||
          !permission.trim() ||
          permission !== permission.trim(),
      )
    ) {
      throw new Error('Tool permissions must be explicit non-empty names');
    }
    if (this.tools.has(tool.name)) {
      throw new Error('Tool name is already registered');
    }
    // Snapshot the definition so later caller mutation cannot change its identity.
    this.tools.set(
      tool.name,
      Object.freeze({
        name: tool.name,
        description: tool.description,
        requiredPermissions: Object.freeze(
          Array.from<string>(tool.requiredPermissions),
        ),
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        execute: tool.execute,
      }),
    );
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): readonly RegisteredTool[] {
    return [...this.tools.values()];
  }
}
