import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Evaluation targets contain deliberate defects. Linting them would report the
      // planted answers as errors and fail the gate, and any autofix would change bytes
      // the answer key has hashed.
      'docs/eval/targets/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './apps/api/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  prettier,
);
