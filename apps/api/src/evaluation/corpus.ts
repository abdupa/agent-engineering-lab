/**
 * Where recorded runs live, relative to the repository root.
 *
 * A list rather than one path: records are filed under the release that produced them, and
 * scoring has to see all of them or a run silently stops being measured the moment a new
 * release starts. Callers resolve these against their own root, because a script and a test
 * sit at different depths.
 */
export const RECORD_DIRECTORIES = [
  'docs/releases/v0.6/runs',
  'docs/releases/v0.7/runs',
] as const;
