export type ModelProviderErrorCode =
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INVALID_OUTPUT'
  | 'REFUSED'
  | 'CONFIGURATION'
  | 'INTERNAL';

const messages: Record<ModelProviderErrorCode, string> = {
  TIMEOUT: 'Model generation timed out',
  UNAVAILABLE: 'Model provider is unavailable',
  INVALID_OUTPUT: 'Model provider returned invalid output',
  REFUSED: 'Model provider declined the request',
  CONFIGURATION: 'Model provider configuration failed',
  INTERNAL: 'Model generation failed',
};

// Never retain SDK errors, response bodies, prompts, headers, or secret-bearing causes.
export class ModelProviderError extends Error {
  constructor(readonly code: ModelProviderErrorCode) {
    super(messages[code]);
    this.name = 'ModelProviderError';
  }
}
