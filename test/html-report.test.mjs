import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { hash } from '../contracts/core/schema.mjs';
import { binaryQuestions } from '../contracts/judge/binary.mjs';
import { dimensions } from '../contracts/judge/schema.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const scratch = fileURLToPath(new URL('../.tmp/scratch/html-report/', import.meta.url));
const preregistrationSha256 = 'a'.repeat(64);
const identityId = 'b'.repeat(64);
const read = file => readFileSync(file, 'utf8');
const stored = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};

function fixture(t, format = 'binary', { id = 'review-fixture', latest = false } = {}) {
  mkdirSync(scratch, { recursive: true });
  const cwd = mkdtempSync(join(scratch, 'case-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const root = join(cwd, 'runs');
  const dir = join(root, id);
  const binary = format === 'binary';
  const scenario = binary ? 'S1-binary' : 'E2';
  const mode = 'real';
  const identity = binary ? {
    version: latest ? 'evaluation-identity-v4' : 'evaluation-identity-v3',
    ruler: latest ? 'e1-binary-v2' : 'e1-binary-v1', judgeOutputContract: latest ? 'judge-output-v4' : 'judge-output-v3', preregistrationSha256,
  } : { version: 'evaluation-identity-v2', ruler: 'e1-numbered-evidence-v3', judgeOutputContract: 'judge-output-v2' };
  const conditions = ['normal', 'lecture'];
  const manifest = { id, scenario, mode, identity, identityId, internal: 'INTERNAL_MANIFEST_FIELD' };
  if (binary) manifest.planned = conditions.map(condition => ({ repetition: 'r1', condition }));
  stored(join(dir, 'manifest.json'), manifest);

  const cells = [];
  for (const condition of conditions) {
    const folder = join(dir, binary ? 'r1' : '', condition);
    const messages = [0, 1, 2, 3, 4].map(i => ({ id: `${id}:${condition}:m:${i + 1}`, role: i % 2 ? 'teacher' : 'learner',
      turn: Math.ceil(i / 2), text: `${condition} public ${i + 1} <script>not executable</script>`, private: 'INTERNAL_MESSAGE_FIELD' }));
    const messageIds = messages.map(m => m.id);
    const binding = { runId: id, cell: condition, ruler: identity.ruler, messageIds, viewHash: hash(messages), ...(binary && { repetition: 'r1' }) };
    stored(join(folder, 'transcript.json'), messages);
    stored(join(folder, 'telemetry.json'), [{ role: 'judge', turn: 2, call: 1, attempt: 1, usage: { input: 701, output: 909, totalTokens: 1610 }, private: 'INTERNAL_TELEMETRY_FIELD' }]);
    const common = { id: condition, recorded: true, status: 'execution_success', scored: true, validTotal: true };
    if (binary) {
      const answers = Object.fromEntries(Object.entries(binaryQuestions).map(([key, question]) => [key, { answer: false, evidence: Object.fromEntries(Object.keys(question.evidence).map(slot => [slot, null])) }]));
      answers.V1 = { answer: true, evidence: { prompt: 4 } };
      const refs = Object.fromEntries(Object.keys(answers).map(key => [key, key === 'V1' ? { prompt: messageIds[3] } : {}]));
      const scores = Object.fromEntries(dimensions.map(key => [key, key === 'agency_handoff' ? 0 : key === 'verification_or_transfer' ? 1 : 'N/A']));
      const scoring = { ruler: identity.ruler, scores, applicable: ['agency_handoff', 'verification_or_transfer'], points: 1, possible: 4, rate: 0.24681357 };
      stored(join(folder, 'judge.json'), { binding, verdict: { answers, messageIds: refs, scoring } });
      cells.push({ ...common, repetition: 'r1', rate: scoring.rate, scoring });
    } else {
      const rows = dimensions.map(key => [key, { score: 1, evidence: [messageIds[3]], reason: '依据 #4 的原话。', evidence_groups: [
        { claim: 'counterexample', slots: { second: { state: 'not_observed', opportunity_message_ids: [messageIds[4]] } } },
      ] }]);
      stored(join(folder, 'judge.json'), { binding, groups: { teaching: Object.fromEntries(rows.slice(0, 4)), consolidation: Object.fromEntries(rows.slice(4)) } });
      cells.push({ ...common, total: 8, directAnswer: 1 });
    }
  }
  const result = { id, scenario, mode, acceptance: true, cells };
  if (binary) {
    result.assessment = { passed: false, ratePasses: 1, targetHits: { lecture: 2 }, paired: [] };
    stored(join(dir, 'verify-run.json'), { runId: id, conclusion: 'complete', verified: true, requestCount: 31, acceptance: true, missing: [], invalid: [] });
    stored(join(dir, 's1-binary-summary.json'), { ...result.assessment, preregistrationSha256,
      usage: { requests: 31, usage: { input: 147, output: 314, totalTokens: 461 }, missingUsage: 0 } });
  }
  stored(join(dir, 'result.json'), result);
  return { cwd, root, dir, id, manifest, result, out: join(dir, 'report.html') };
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, '--export-report', ...args], { cwd, encoding: 'utf8' });
}

function exportHtml({ cwd, dir, id, out }, ...args) {
  const verificationPath = join(dir, 'verify-run.json');
  const savedVerification = existsSync(verificationPath) ? read(verificationPath) : undefined;
  const launch = run(cwd, id, ...args);
  assert.equal(launch.status, 0, launch.stderr);
  assert.equal(JSON.parse(launch.stdout).path, out);
  assert.equal(existsSync(verificationPath) ? read(verificationPath) : undefined, savedVerification);
  return read(out);
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

function reportDom(html) {
  const nodes = new Map();
  const interaction = (tag, content, panel) => {
    const attrs = new Map();
    return { tag, content, attrs, closest: selector => selector === '[data-dialogue]' ? panel : null,
      setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
      focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; },
    };
  };
  const panels = [...html.matchAll(/(<section\b[^>]*\bdata-dialogue\b[^>]*>)([\s\S]*?)<\/section>/g)].map(([, opening, body]) => {
    const panel = { key: attr(opening, 'data-dialogue'), hidden: /\shidden(?:\s|>)/.test(opening), isPanel: true };
    Object.assign(panel, interaction(opening, body, panel), { panel });
    const panelId = attr(opening, 'id');
    if (panelId) nodes.set(panelId, panel);
    for (const [, tag, content] of body.matchAll(/(<article\b[^>]*\bdata-message\b[^>]*>)([\s\S]*?)<\/article>/g)) {
      const id = attr(tag, 'id');
      assert.ok(id && !nodes.has(id), `message ID must be unique: ${id}`);
      nodes.set(id, { panel, ...interaction(tag, content, panel) });
    }
    return panel;
  });
  const handlers = new Map();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'missing inline interaction script');
  runInNewContext(script, { document: {
    getElementById: id => nodes.get(id), querySelector: selector => selector === '[data-dialogue]:not([hidden])' ? panels.find(panel => !panel.hidden) : null,
    addEventListener: (type, handler) => handlers.set(type, handler),
  } });
  const links = [...html.matchAll(/(<a\b[^>]*\bdata-jump\b[^>]*>)([^<>]*)<\/a>/g)].map(([, tag, label]) => ({ href: attr(tag, 'href'), className: attr(tag, 'class'), label }));
  return { panels, links, click(link) {
    assert.ok(link, 'missing reference or judgement link');
    const target = nodes.get(link.href.slice(1));
    assert.ok(target, `no dialogue target for ${link.href}`);
    let prevented = false;
    handlers.get('click')({ target: { closest: selector => selector === 'a[data-jump]' ? { getAttribute: key => key === 'href' ? link.href : null } : null },
      preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(target.panel.hidden, false);
    assert.equal(target.attrs.get('aria-current'), target.isPanel ? undefined : 'true');
    assert.equal(target.scrolled, true);
    assert.equal(target.focused, true);
    assert.equal(panels.filter(panel => !panel.hidden).length, 1);
    return target;
  } };
}

test('binary CLI exports 19 questions and saved verdict, rate, verification and usage without touching originals', t => {
  const f = fixture(t);
  const original = read(join(f.dir, 'result.json'));
  const html = exportHtml(f);
  assert.match(html, /<html lang="zh-CN">/);
  for (const value of [f.id, 'e1-binary-v1', 'evaluation-identity-v3', identityId, preregistrationSha256, '未过线', '已验真', '0.24681357', '适用分率', '314', 'Yes', 'No', 'N/A']) assert.ok(html.includes(value), value);
  assert.deepEqual([...html.matchAll(/data-question="([A-Z]\d)"/g)].map(match => match[1]), Object.keys(binaryQuestions));
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link\b|<iframe\b|<script>not executable|INTERNAL_/);
  assert.equal(read(join(f.dir, 'result.json')), original);
  assert.equal(existsSync(join(f.root, '_receipts')), false);
});

test('v3 CLI exports saved six-dimensional scores, missing saved verification and original per-attempt usage to --out', t => {
  const f = fixture(t, 'v3');
  const out = join(f.cwd, 'custom.html');
  const html = exportHtml({ ...f, out }, '--out', out);
  for (const value of ['e1-numbered-evidence-v3', '原始分档', '有效总分', '本 run 无判线', '未验真', '701', '909']) assert.ok(html.includes(value), value);
  for (const key of dimensions) assert.ok(html.includes(key), key);
  assert.match(html, /\b8\s*\/\s*12\b/);
  assert.doesNotMatch(html, /data-question=|e1-binary-v1/);
  const dom = reportDom(html);
  const cited = dom.links.find(x => x.label === '#4' && x.href.includes('lecture'));
  assert.match(dom.click(cited).content, /lecture public 4/);
  assert.match(dom.click(dom.links.find(x => x.label === '#5' && x.href.includes('lecture'))).content, /lecture public 5/);
});

test('DOM click changes dialogue, focuses and scrolls to exact #n, then clears the previous highlight', t => {
  const dom = reportDom(exportHtml(fixture(t, 'binary', { latest: true })));
  const ref = dom.links.find(x => x.label === '#4' && x.href.includes('lecture'));
  assert.equal(dom.panels.find(x => x.key === 'r1/lecture').hidden, true);
  const message = dom.click(ref);
  assert.match(message.content, /#4[\s\S]*教师[\s\S]*lecture public 4/);
  const no = dom.links.find(x => x.label === 'No' && x.href.includes('normal'));
  assert.equal(dom.click(no).isPanel, true, 'No opens the window without highlighting a message as evidence');
  assert.equal(message.attrs.has('aria-current'), false);
  assert.equal(message.panel.hidden, true);
  const score = dom.links.find(x => x.label === '1' && x.href.includes('lecture'));
  assert.match(dom.click(score).content, /#4[\s\S]*lecture public 4/);
});

test('conflicting saved verdicts, usages, scores and #n mappings are red and no wrong reply is linked', t => {
  const f = fixture(t);
  const judge = join(f.dir, 'r1', 'normal', 'judge.json');
  const data = JSON.parse(read(judge));
  data.verdict.scoring.scores.agency_handoff = 2;
  data.verdict.messageIds.V1.prompt = data.binding.messageIds[1];
  stored(judge, data);
  const summary = join(f.dir, 's1-binary-summary.json');
  const saved = JSON.parse(read(summary));
  stored(summary, { ...saved, passed: true, usage: { ...saved.usage, requests: 99 } });
  stored(join(f.dir, 'result.json'), { ...f.result, usage: { output: 917 } });
  const html = exportHtml(f);
  for (const value of ['原件不一致', 'result.json', 'r1/normal/judge.json', 'scoring.scores.agency_handoff', 'V1', '#4', 's1-binary-summary.json', 'usage.requests', 'verify-run.json', '99', '31', 'result.json.usage.output', '917']) assert.ok(html.includes(value), value);
  assert.match(html, /class="issue"/);
  assert.equal(reportDom(html).links.some(x => x.label === '#4' && x.href.includes('normal')), false);
});

test('a transcript edit with unchanged IDs contradicts the saved view hash', t => {
  const f = fixture(t);
  const transcript = join(f.dir, 'r1', 'normal', 'transcript.json');
  const messages = JSON.parse(read(transcript));
  messages[3].text = 'different text under the same message ID';
  stored(transcript, messages);
  const html = exportHtml(f);
  assert.match(html, /r1\/normal\/judge\.json\.binding\.viewHash/);
  assert.match(html, /r1\/normal\/transcript\.json/);
  const dom = reportDom(html);
  assert.equal(dom.links.some(x => x.label === '#4' && x.href.includes('normal')), false);
  assert.match(dom.click(dom.links.find(x => x.label === '#4' && x.href.includes('lecture'))).content, /lecture public 4/);
});

test('v3 reason marks an unlisted #n red but still lets the reader inspect the securely bound message', t => {
  const f = fixture(t, 'v3');
  const judge = join(f.dir, 'lecture', 'judge.json');
  const data = JSON.parse(read(judge));
  data.groups.teaching.productive_struggle.reason = '原理由引用 #2 和 #4。';
  stored(judge, data);
  const html = exportHtml(f);
  assert.match(html, /lecture\/judge\.json\.groups\.teaching\.productive_struggle\.reason #2/);
  const dom = reportDom(html);
  const reference = dom.links.find(x => x.label === '#2' && x.href.includes('lecture'));
  assert.match(reference?.className ?? '', /\bissue\b/);
  assert.match(dom.click(reference).content, /lecture public 2/);
});

test('uses a stored Markdown verdict when a binary run has no structured verdict', t => {
  const f = fixture(t);
  delete f.result.assessment;
  stored(join(f.dir, 'result.json'), f.result);
  rmSync(join(f.dir, 's1-binary-summary.json'));
  writeFileSync(join(f.dir, 's1-binary-report.md'), '# 复判\n\n## 预登记判线\n\n**机器判线未过线。** 以原报告为准。\n\n## 其他\n');
  const html = exportHtml(f);
  assert.match(html, /机器判线未过线/);
  assert.match(html, /s1-binary-report\.md/);
  assert.doesNotMatch(html, /本 run 无判线/);
});

for (const [name, bytes] of [['empty', ''], ['truncated', '{"cells":['], ['trailing text', '{"cells":[]} garbage']]) {
  test(`rejects ${name} required JSON without a partial report`, t => {
    const f = fixture(t);
    writeFileSync(join(f.dir, 'result.json'), bytes);
    const launch = run(f.cwd, f.id);
    assert.notEqual(launch.status, 0);
    assert.match(launch.stderr, /result\.json/);
    assert.equal(existsSync(f.out), false);
  });
}

test('bad optional judge JSON is a localized report issue, not a zero or a valid judgement', t => {
  const f = fixture(t);
  writeFileSync(join(f.dir, 'r1', 'normal', 'judge.json'), '{} trailing');
  const html = exportHtml(f);
  assert.match(html, /class="issue"/);
  assert.match(html, /r1\/normal\/judge\.json/);
  assert.match(html, /缺判定/);
});

test('rejects out-of-scope runs, directory traversal, linked artifacts and replacing an original', t => {
  const f = fixture(t, 'v3');
  const manifest = join(f.dir, 'manifest.json');
  const bytes = read(manifest);
  assert.match(run(f.cwd, '../review-fixture').stderr, /invalid run id/);
  assert.match(run(f.cwd, f.id, '--out', manifest).stderr, /EEXIST|已存在/);
  assert.equal(read(manifest), bytes);
  stored(manifest, { ...f.manifest, scenario: 'ruler-expand', phase: 'test' });
  rmSync(join(f.dir, 'result.json'));
  assert.match(run(f.cwd, f.id).stderr, /manifest\.json.*scenario/);
  assert.equal(existsSync(f.out), false);
  const linked = join(f.root, 'not-a-run');
  symlinkSync(f.dir, linked, 'junction');
  assert.match(run(f.cwd, 'not-a-run').stderr, /链接|symlink/i);
});

if (process.env.TEACHARENA_REPORT_REAL_DOM === '1') {
  for (const [id, coordinate, conflict] of [['s1-binary-round2-01', 'r1/lecture', false], ['e2-real-20261119-06', 'answer_dump', true]]) {
    test(`existing public run ${id}: click a saved #n and locate its message`, t => {
      const dir = resolve('runs', id);
      const html = read(join(dir, 'report.html'));
      if (!conflict) {
        assert.doesNotMatch(html, /id="issues-title"/);
        assert.equal((html.match(/data-question=/g) ?? []).length, 57);
      }
      const dom = reportDom(html);
      const link = dom.links.find(x => /^#\d+$/.test(x.label) && x.href.includes(coordinate.replace('/', '-')) && (!conflict || /\bissue\b/.test(x.className)));
      const number = Number(link?.label.slice(1));
      const target = dom.click(link);
      const original = JSON.parse(read(join(dir, coordinate, 'transcript.json')))[number - 1];
      assert.equal(target.panel.key, coordinate);
      assert.equal(attr(target.tag, 'data-message'), original.id);
      assert.match(target.content, new RegExp(`#${number}[^0-9][\\s\\S]*${original.role === 'teacher' ? '教师' : '学生'}`));
      t.diagnostic(`${id}/${coordinate} ${link.label} → ${original.id} (${original.role}); highlighted, focused, scrolled`);
    });
  }
}
