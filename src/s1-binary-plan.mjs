import { targets } from '../config/e2.mjs';
import { cellIds } from '../contracts/artifacts/schema.mjs';
import { requireThat } from '../contracts/core/schema.mjs';
import { binaryQuestions, compareBinary } from '../contracts/judge/binary.mjs';

export const s1Scenario = 'S1-binary';
export const s1SourceId = 'e2-real-20261119-06';
export const s1Repetitions = ['r1', 'r2', 'r3'];
export const s1Plan = s1Repetitions.flatMap(repetition => cellIds.map(condition => ({ repetition, condition })));
export const s1Targets = targets;
export const s1PreregistrationFile = 'preregistration.md';
export const s1Path = ({ repetition, condition }) => `${repetition}/${condition}`;

export function constructExpectations(markdown) {
  const heading = '## 构造预期答案';
  const section = markdown.split(heading)[1]?.split('\n## ')[0];
  const table = section?.split(/\r?\n/).filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(value => value.trim()));
  const questions = Object.keys(binaryQuestions);
  requireThat(table?.length === cellIds.length + 2 && table[0].join(',') === ['条件', ...questions].join(','), 'preregistration must list every binary question');
  const expected = new Map([['Yes', true], ['No', false], ['不定', null]]);
  return Object.fromEntries(table.slice(2).map(([condition, ...answers], i) => {
    requireThat(condition === cellIds[i] && answers.length === questions.length && answers.every(answer => expected.has(answer)), 'invalid preregistration expectation row');
    requireThat(condition !== 'normal' || answers.every(answer => answer === '不定'), 'normal cannot have construction ground truth');
    return [condition, Object.fromEntries(questions.map((question, j) => [question, expected.get(answers[j])]))];
  }));
}

export function requireRegisteredSource(markdown, source) {
  requireThat(markdown.includes(`源 run ID \`${source.runId}\``) && markdown.includes(`manifest SHA256 \`${source.manifestSha256}\``) && markdown.includes(`源身份 \`${source.identityId}\``), 'preregistration source identity or manifest digest mismatch');
  for (const { cell, transcriptSha256 } of source.cells) {
    requireThat(markdown.includes(`| ${cell} | \`${transcriptSha256}\` |`), `preregistration source digest mismatch for ${cell}`);
  }
}

export function assessS1(cells) {
  const scores = new Map(cells.map(row => [`${row.repetition}/${row.id}`, row.scoring]));
  const targetHits = Object.fromEntries(Object.keys(targets).map(condition => [condition, 0]));
  let ratePasses = 0;
  const paired = s1Repetitions.map(repetition => {
    const normal = scores.get(`${repetition}/normal`);
    const pairs = Object.entries(targets).map(([condition, dimension]) => {
      const variant = scores.get(`${repetition}/${condition}`);
      const delta = normal?.possible && variant?.possible ? normal.points * variant.possible - variant.points * normal.possible : null;
      const totalDirection = delta === null ? 'inconclusive' : delta > 0 ? 'lower' : delta < 0 ? 'higher' : 'tie';
      const pair = compareBinary(normal, variant, dimension);
      if (pair.targetStatus === 'lower') targetHits[condition]++;
      return { condition, totalDirection, ...pair };
    });
    if (pairs.every(pair => pair.totalDirection === 'lower')) ratePasses++;
    return { repetition, pairs };
  });
  const passed = ratePasses === s1Repetitions.length && Object.values(targetHits).every(n => n === s1Repetitions.length);
  return { paired, targetHits, ratePasses, passed };
}
