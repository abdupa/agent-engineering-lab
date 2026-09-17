import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  AgentDecisionService,
  AgentDecisionTransportSchema,
  buildTypedDecisionSchema,
  translateAgentDecision,
  translateTypedDecision,
} from './agent-decision.service';
import type { AgentToolDescription } from './agent-decision.service';
import type {
  ModelProvider,
  StructuredGenerationRequest,
} from '../ai/model-provider';

/**
 * Two live runs failed because the model could not reliably encode JSON inside a JSON
 * string. These tests reproduce that failure against the shipped transport and show the
 * typed transport cannot exhibit it — there is no string left to escape.
 */

const tools: AgentToolDescription[] = [
  {
    name: 'read-file',
    description: 'Read a file',
    inputSchema: z.object({ path: z.string(), maxBytes: z.number().int() }),
  },
  {
    name: 'report-finding',
    description: 'Record a finding',
    inputSchema: z.object({
      path: z.string(),
      line: z.number().int().nullable(),
      severity: z.enum(['high', 'medium', 'low']),
      claim: z.string(),
    }),
  },
];

function providerReturning(payload: unknown) {
  const seen: { instructions: string; input: string }[] = [];
  const provider: ModelProvider = {
    generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T> {
      seen.push({ instructions: request.instructions, input: request.input });
      return request.schema.parseAsync(payload);
    },
  };
  return { provider, seen };
}

describe('the failure observed on runs 5 and 6', () => {
  // Exactly the shape the live logs described: complete, ends in a brace, and carrying
  // inner quotes that were never escaped.
  const badlyEscaped =
    '{"decision":{"type":"tool_call","toolName":"report-finding",' +
    '"argumentsJson":"{"path":"workspace.ts","line":81,"severity":"medium",' +
    '"claim":"Symlink resolution can bypass the exclusion checks"}"}}';

  it('is a parse failure, not a schema failure', () => {
    expect(badlyEscaped.trimEnd().endsWith('}')).toBe(true);
    expect(() => {
      JSON.parse(badlyEscaped);
    }).toThrow();
  });

  it('shows the escape shortfall the live logs reported', () => {
    const quotes = (badlyEscaped.match(/"/g) ?? []).length;
    const backslashes = (badlyEscaped.match(/\\/g) ?? []).length;
    // Run 6 logged 36 quotes against 8 backslashes. Same signature: far too few escapes.
    expect(quotes).toBeGreaterThan(20);
    expect(backslashes).toBe(0);
  });

  it('breaks the string transport even when the payload is well-formed at the inner level', () => {
    // A correctly escaped payload is what the transport needs, and what the model
    // repeatedly failed to produce.
    const correct = {
      decision: {
        type: 'tool_call' as const,
        toolName: 'report-finding',
        argumentsJson: JSON.stringify({ path: 'workspace.ts', line: 81 }),
      },
    };
    expect(() =>
      translateAgentDecision(AgentDecisionTransportSchema.parse(correct)),
    ).not.toThrow();

    // Drop one escape and the whole envelope is unrecoverable before any schema runs.
    const broken = JSON.stringify(correct).replace('\\"path\\"', '"path"');
    expect(() => {
      JSON.parse(broken);
    }).toThrow();
  });

  it('cannot arise in the typed transport, because there is no string to escape', () => {
    const schema = buildTypedDecisionSchema(tools);
    const decision = translateTypedDecision(
      schema.parse({
        decision: {
          toolName: 'report-finding',
          arguments: {
            path: 'workspace.ts',
            line: 81,
            severity: 'medium',
            claim: 'Symlink resolution can bypass the exclusion checks',
          },
        },
      }),
    );
    expect(decision).toEqual({
      type: 'tool_call',
      toolName: 'report-finding',
      arguments: {
        path: 'workspace.ts',
        line: 81,
        severity: 'medium',
        claim: 'Symlink resolution can bypass the exclusion checks',
      },
    });
  });
});

describe('the typed schema satisfies the rules checkable offline', () => {
  it('converts, is strict, and requires every property', () => {
    const format: Record<string, unknown> = zodTextFormat(
      buildTypedDecisionSchema(tools),
      'structured_output',
    ) as unknown as Record<string, unknown>;

    expect(format.strict).toBe(true);

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

    // Strict Structured Outputs rejects both of these. `.optional()` without
    // `.nullable()` on a finding's line was caught this way, before any live call.
    expect(loose).toBe(0);
    expect(optional).toBe(0);
  });

  it('refuses to build without a schema for every tool', () => {
    expect(() =>
      buildTypedDecisionSchema([
        tools[0] as AgentToolDescription,
        { name: 'grep', description: 'Search' },
      ]),
    ).toThrow('input schema for every tool');
  });

  it('refuses a tool that would collide with finish', () => {
    expect(() =>
      buildTypedDecisionSchema([
        { name: 'finish', description: 'Collides', inputSchema: z.object({}) },
      ]),
    ).toThrow('may not be named finish');
  });
});

describe('both transports produce the same canonical decision', () => {
  it.each([
    [
      'a tool call',
      {
        decision: {
          type: 'tool_call' as const,
          toolName: 'read-file',
          argumentsJson: JSON.stringify({ path: 'a.ts', maxBytes: 100 }),
        },
      },
      {
        decision: {
          toolName: 'read-file',
          arguments: { path: 'a.ts', maxBytes: 100 },
        },
      },
    ],
    [
      'a finish',
      { decision: { type: 'finish' as const, result: 'Done.' } },
      { decision: { toolName: 'finish', result: 'Done.' } },
    ],
  ])('%s', (_label, stringShape, typedShape) => {
    expect(
      translateAgentDecision(AgentDecisionTransportSchema.parse(stringShape)),
    ).toEqual(translateTypedDecision(typedShape));
  });
});

describe('the switch', () => {
  it('uses the typed transport by default', async () => {
    const { provider, seen } = providerReturning({
      decision: {
        toolName: 'read-file',
        arguments: { path: 'a.ts', maxBytes: 100 },
      },
    });
    await new AgentDecisionService(provider).decide(
      { goal: 'Audit', observations: [] },
      tools,
    );
    expect(seen[0]?.instructions).not.toContain('argumentsJson');
  });

  it('returns to the string transport when explicitly disabled', async () => {
    const { provider, seen } = providerReturning({
      decision: {
        type: 'tool_call',
        toolName: 'read-file',
        argumentsJson: '{"path":"a.ts","maxBytes":100}',
      },
    });
    await new AgentDecisionService(provider, { typedArguments: false }).decide(
      { goal: 'Audit', observations: [] },
      tools,
    );
    expect(seen[0]?.instructions).toContain('argumentsJson');
  });

  it('uses the typed transport when enabled and every tool has a schema', async () => {
    const { provider, seen } = providerReturning({
      decision: {
        toolName: 'read-file',
        arguments: { path: 'a.ts', maxBytes: 100 },
      },
    });
    await new AgentDecisionService(provider, {
      typedArguments: true,
    }).decide({ goal: 'Audit', observations: [] }, tools);
    expect(seen[0]?.instructions).not.toContain('argumentsJson');
  });

  it('falls back to the string transport when a tool has no schema', async () => {
    const { provider, seen } = providerReturning({
      decision: {
        type: 'tool_call',
        toolName: 'read-file',
        argumentsJson: '{"path":"a.ts","maxBytes":100}',
      },
    });
    await new AgentDecisionService(provider, { typedArguments: true }).decide(
      { goal: 'Audit', observations: [] },
      [
        tools[0] as AgentToolDescription,
        { name: 'grep', description: 'Search' },
      ],
    );
    expect(seen[0]?.instructions).toContain('argumentsJson');
  });

  it('never serializes a tool schema into the model input', async () => {
    const { provider, seen } = providerReturning({
      decision: { toolName: 'finish', result: 'Done.' },
    });
    await new AgentDecisionService(provider, {
      typedArguments: true,
    }).decide({ goal: 'Audit', observations: [] }, tools);
    const input = JSON.parse(seen[0]?.input ?? '{}') as {
      tools: Record<string, unknown>[];
    };
    expect(input.tools).toEqual([
      { name: 'read-file', description: 'Read a file' },
      { name: 'report-finding', description: 'Record a finding' },
    ]);
  });
});
