import type { ZodType } from 'zod';

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');

export interface StructuredGenerationRequest<T> {
  instructions: string;
  input: string;
  schema: ZodType<T>;
}

export interface ModelProvider {
  /** Implementations return schema-validated output; failures use ModelProviderError. */
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<T>;
}
