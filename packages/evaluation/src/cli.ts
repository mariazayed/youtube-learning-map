import { readFileSync } from 'node:fs';
import { createEvaluationTemplate, loadDataset, scoreEvaluation } from './index';

function usage(): never {
  throw new Error(
    'Usage: pnpm eval:ai dataset | template | score <evaluation-results.json>',
  );
}

const [, , command, path] = process.argv;

if (command === 'dataset') {
  const dataset = loadDataset();
  console.log(
    JSON.stringify(
      {
        valid: true,
        version: dataset.version,
        videos: dataset.videos.length,
        promptVersion: dataset.promptVersion,
        schemaVersion: dataset.schemaVersion,
      },
      null,
      2,
    ),
  );
} else if (command === 'template') {
  console.log(JSON.stringify(createEvaluationTemplate(), null, 2));
} else if (command === 'score') {
  if (!path) usage();
  const report = scoreEvaluation(JSON.parse(readFileSync(path, 'utf8')));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} else {
  usage();
}
