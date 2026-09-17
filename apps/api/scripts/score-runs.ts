import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadRunRecords } from '../src/evaluation/run-record.loader';
import { loadRunLabel } from '../src/evaluation/run-label.loader';
import { loadAnswerKey, verifyTarget } from '../src/evaluation/target-verify';
import {
  formatRate,
  scoreLabeledRun,
  scoreRun,
  type Scorecard,
} from '../src/evaluation/metrics';

/**
 * Scores recorded runs offline and writes a scorecard for each one that can be scored.
 *
 * Spends nothing. It re-reads decisions the model already made, so it can be run as often
 * as anyone likes — which is the property that makes a baseline affordable at all, and the
 * reason every milestone before the live run is free.
 *
 *   node -r ts-node/register scripts/score-runs.ts
 *   node -r ts-node/register scripts/score-runs.ts --target ../../docs/eval/targets/small-service
 *
 * With no arguments it scores every stored run against its label, if it has one. With
 * --target it scores them against a labeled target instead, which is how the live run in
 * v0.7-007 will be scored.
 */

const repoRoot = resolve(__dirname, '../../..');
const RECORDS = join(repoRoot, 'docs/releases/v0.6/runs');
const LABELS = join(repoRoot, 'docs/eval/labels');
const SCORECARDS = join(repoRoot, 'docs/eval/scorecards');

interface Row {
  readonly file: string;
  readonly status: string;
  readonly detail: string;
}

function targetArgument(): string | undefined {
  const index = process.argv.indexOf('--target');
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value) {
    console.error('--target needs a directory');
    process.exit(2);
  }
  return resolve(process.cwd(), value);
}

/** One line per measure, so a scorecard can be read without opening the JSON. */
function summarize(card: Scorecard): string {
  const cost =
    card.cost.tokensPerLocatedDefect === undefined
      ? `${card.cost.totalTokens} tokens, nothing located`
      : `${Math.round(card.cost.tokensPerLocatedDefect).toLocaleString()} tokens per located defect`;

  return [
    `recall ${formatRate(card.recall)}`,
    `precision ${card.precision ? formatRate(card.precision) : 'n/a'}`,
    `citations ${formatRate(card.citationAccuracy)}`,
    `severity ${formatRate(card.severity.agreement)}`,
    cost,
  ].join(' · ');
}

/**
 * Scorecards are filed under what they were scored against, not just the run id.
 *
 * The first version wrote every scorecard to `<runId>.json`, so scoring the same runs
 * against a target silently overwrote the scorecards produced from their labels. Two
 * different measurements of the same run are two different results, and the one that ran
 * most recently is not the one that is true.
 */
async function write(
  card: Scorecard,
  basis: string,
  extra: object,
): Promise<void> {
  const directory = join(SCORECARDS, basis);
  mkdirSync(directory, { recursive: true });
  await writeFile(
    join(directory, `${card.runId}.json`),
    `${JSON.stringify({ ...card, scoredAgainst: basis, ...extra }, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const targetDirectory = targetArgument();
  const loaded = await loadRunRecords(RECORDS);
  const rows: Row[] = [];

  // Resolved once: scoring nine runs against a target whose key is stale should fail once,
  // loudly, rather than nine times in the middle of a table.
  let target: Awaited<ReturnType<typeof loadAnswerKey>> | undefined;
  if (targetDirectory) {
    target = await loadAnswerKey(targetDirectory);
    if (!target.ok) {
      console.error(`target key: ${target.reason} — ${target.detail}`);
      process.exit(1);
    }
    const verified = await verifyTarget(targetDirectory, target.key);
    if (!verified.ok) {
      console.error('target has drifted from its key:');
      for (const problem of verified.problems) {
        console.error(`  ${problem.kind} ${problem.path}`);
      }
      process.exit(1);
    }
  }

  for (const entry of loaded) {
    if (!entry.load.ok) {
      // Unscoreable, never zero. A file that will not parse is not a run that found
      // nothing, and writing it down as one is how an evaluation starts lying.
      rows.push({
        file: entry.file,
        status: 'unscoreable',
        detail: `${entry.load.reason}: ${entry.load.detail}`,
      });
      continue;
    }

    const record = entry.load.record;

    if (target?.ok) {
      const card = scoreRun(record, target.key);
      await write(card, `target-${target.key.target}`, {});
      rows.push({
        file: entry.file,
        status: 'scored',
        detail: summarize(card),
      });
      continue;
    }

    const label = await loadRunLabel(LABELS, record.runId);
    if (!label.ok) {
      rows.push({
        file: entry.file,
        status: 'unlabeled',
        detail:
          label.reason === 'unreadable_label'
            ? `${record.findings.length} finding(s), no label to score against`
            : `${label.reason}: ${label.detail}`,
      });
      continue;
    }

    const { scorecard, ruleAgreement } = scoreLabeledRun(record, label.label);
    await write(scorecard, 'by-label', {
      labeledBy: label.label.labeledBy,
      labeledOn: label.label.labeledOn,
      ruleAgreement,
    });
    rows.push({
      file: entry.file,
      status: 'scored',
      detail: `${summarize(scorecard)} · rule agrees with the reader ${formatRate(ruleAgreement.agreement)}`,
    });
  }

  const width = Math.max(...rows.map((row) => row.file.length));
  for (const row of rows) {
    console.log(
      `${row.file.padEnd(width)}  ${row.status.padEnd(11)}  ${row.detail}`,
    );
  }

  const scored = rows.filter((row) => row.status === 'scored').length;
  console.log(
    `\n${scored} of ${rows.length} scored. ` +
      `${rows.filter((row) => row.status === 'unlabeled').length} unlabeled, ` +
      `${rows.filter((row) => row.status === 'unscoreable').length} unscoreable.`,
  );
  if (scored > 0) {
    const basis = targetDirectory
      ? `target-${target?.ok ? target.key.target : 'unknown'}`
      : 'by-label';
    console.log(`Scorecards written to docs/eval/scorecards/${basis}/.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
