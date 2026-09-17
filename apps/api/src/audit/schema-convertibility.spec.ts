import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { buildTypedDecisionSchema } from '../agent/agent-decision.service';
import { ToolRegistry } from '../tools/tool-registry';
import { createGrepTool } from './grep.tool';
import { createListFilesTool } from './list-files.tool';
import { createReadFileTool } from './read-file.tool';
import {
  FindingCollector,
  createReportFindingTool,
} from './report-finding.tool';
import { Workspace } from './workspace';

/**
 * Under the typed transport every tool's input schema becomes part of the model-facing
 * schema, so a tool that cannot be converted to JSON Schema breaks **every** decision —
 * before any network call, with zero tokens spent and a bare CONFIGURATION error.
 *
 * That happened: a `.transform()` added to normalize an empty path took `list-files` and
 * `grep` out of the union and cost a live run. The conversion check existed only as a
 * throwaway script that had been deleted, so nothing caught it. This is that check, kept.
 */

let sandbox: string;
let registry: ToolRegistry;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'convertibility-'));
  const workspace = await Workspace.create(sandbox);
  registry = new ToolRegistry();
  registry.register(createListFilesTool(workspace));
  registry.register(createReadFileTool(workspace));
  registry.register(createGrepTool(workspace));
  registry.register(createReportFindingTool(workspace, new FindingCollector()));
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('every registered audit tool converts to a provider schema', () => {
  it('lists the tools being checked, so an empty registry cannot pass silently', () => {
    expect(
      registry
        .list()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(['grep', 'list-files', 'read-file', 'report-finding']);
  });

  it.each([['list-files'], ['read-file'], ['grep'], ['report-finding']])(
    '%s',
    (name) => {
      const tool = registry.get(name);
      if (!tool) throw new Error(`${name} is not registered`);
      expect(() =>
        zodTextFormat(z.object({ arguments: tool.inputSchema }), 'probe'),
      ).not.toThrow();
    },
  );
});

describe('the whole typed decision schema converts', () => {
  it('builds and converts with every tool in it', () => {
    const tools = registry.list().map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));

    const format = zodTextFormat(
      buildTypedDecisionSchema(tools),
      'structured_output',
    ) as unknown as Record<string, unknown>;

    expect(format.strict).toBe(true);
  });

  it('satisfies the strict rules that are checkable offline', () => {
    const tools = registry.list().map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
    const format = zodTextFormat(
      buildTypedDecisionSchema(tools),
      'structured_output',
    ) as unknown as Record<string, unknown>;

    let loose = 0;
    let optional = 0;
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object') {
        if (n.additionalProperties !== false) loose += 1;
        const props = Object.keys(n.properties ?? {});
        const required = (n.required ?? []) as string[];
        if (props.some((p) => !required.includes(p))) optional += 1;
      }
      for (const value of Object.values(n)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    walk(format.schema);

    // `.optional()` without `.nullable()` and objects permitting extra properties are
    // both rejected by the API, and neither shows up until a live call unless checked.
    expect(loose).toBe(0);
    expect(optional).toBe(0);
  });
});

describe('the failure this guards against', () => {
  it('a transform in a tool schema breaks conversion', () => {
    // Pinning the actual mechanism: it is not that transforms are discouraged, it is
    // that they make the schema unrepresentable and take the whole union down with them.
    const withTransform = z.object({
      path: z
        .string()
        .default('.')
        .transform((value) => (value === '' ? '.' : value)),
    });
    expect(() =>
      zodTextFormat(z.object({ arguments: withTransform }), 'probe'),
    ).toThrow(/[Tt]ransform/);
  });
});
