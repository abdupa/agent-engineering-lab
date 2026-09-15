import { z } from 'zod';
import type { Tool } from './tool';

const inputSchema = z.object({ left: z.number(), right: z.number() });
const outputSchema = z.number();

/** Ordinary finite JavaScript-number addition; not arbitrary-precision arithmetic. */
export const addNumbersTool: Tool<z.infer<typeof inputSchema>, number> = {
  name: 'add-numbers',
  requiredPermissions: ['calculate'],
  description: 'Add two finite numbers',
  inputSchema,
  outputSchema,
  execute: ({ left, right }) => Promise.resolve(left + right),
};
