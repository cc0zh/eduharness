import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const allowedRepoRootMd = new Set(['README.md', 'AGENTS.md']);
const allowedDocsRootMd = new Set(['README.md', 'status.md', 'scenarios.md', 'runbook.md', 'glossary.md', 'history.md']);
const lineBudgets = {
  'AGENTS.md': { min: 1, max: 30 },
  'docs/status.md': { min: 1, max: 100 },
  'docs/scenarios.md': { min: 1, max: 100 },
  'docs/runbook.md': { min: 1, max: 120 },
  'docs/glossary.md': { min: 1, max: 60 },
  'README.md': { min: 120, max: 220 },
};

const toPosix = value => value.split(sep).join('/');
const countLines = text => text === '' ? 0 : text.replace(/\r?\n$/, '').split(/\r?\n/).length;

function safeStat(path) {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`拒绝符号链接（symlink）：${path}`);
    return info;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function walkFiles(dir, predicate, out = []) {
  if (!safeStat(dir)?.isDirectory()) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`拒绝符号链接（symlink）：${full}`);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

/**
 * Replace fenced code block contents with blank lines while preserving line indices.
 * @param {string} text
 * @returns {string[]}
 */
function stripFences(text) {
  let fence;
  return text.split(/\r?\n/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  });
}

function stripInlineCode(line) {
  return line.replace(/(`+)[\s\S]*?\1/g, '');
}

/**
 * Compute GitHub-compatible heading slugs and explicit HTML anchors for a Markdown document.
 * @param {string[]} lines
 * @returns {Set<string>}
 */
function headingIds(lines) {
  const counts = new Map();
  const ids = new Set();
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/<a\b[^>]*\b(?:name|id)\s*=\s*["']([^"']+)["']/gi)) {
      ids.add(match[1]);
    }
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/)?.[1]
      ?? (/^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? '') ? line.trim() : '');
    if (!heading) return;
    const cleaned = heading
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '');
    const slug = cleaned
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    ids.add(count ? `${slug}-${count}` : slug);
  });
  return ids;
}

function extractLinks(lines, report) {
  const definitions = new Map();
  const visible = lines.map(line => (/^(?: {4}|\t)/.test(line) ? '' : stripInlineCode(line)));
  const normalize = label => label.trim().replace(/\s+/g, ' ').toLowerCase();
  for (const line of visible) {
    const match = line.match(/^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/);
    if (match) definitions.set(normalize(match[1]), match[2] ?? match[3]);
  }
  const links = [];
  visible.forEach((line, index) => {
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) return;
    const inline = /!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|((?:\\.|[^\s()\\]|\([^()]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
    const remaining = line.replace(inline, (_match, angle, bare) => {
      links.push({ target: angle ?? bare, line: index + 1 });
      return '';
    });
    for (const match of remaining.matchAll(/!?\[([^\]]+)\](?:\[([^\]]*)\])?/g)) {
      const label = normalize(match[2] || match[1]);
      if (definitions.has(label)) links.push({ target: definitions.get(label), line: index + 1 });
      else if (match[2] !== undefined) report(index + 1, `未定义的引用链接: ${label}`);
    }
  });
  return links;
}

function checkLayout(root, errors) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.md')) continue;
    if (!allowedRepoRootMd.has(entry.name)) {
      errors.push(`${entry.name}: 禁止在仓库根目录新增文档。状态与说明写入 docs/ 对应活文档，历史归入 docs/archive/，经验写入 docs/learnings/YYYY-MM/，草稿放 .tmp/scratch/<任务名>/。`);
    }
  }
  for (const rel of ['AGENTS.md', 'README.md', 'docs/README.md', 'docs/status.md', 'docs/scenarios.md', 'docs/runbook.md', 'docs/glossary.md', 'docs/history.md', 'docs/plans/roadmap.md', 'docs/archive/README.md', 'docs/learnings/README.md', 'docs/research/README.md', 'docs/research/readme-sources.md']) {
    if (!safeStat(join(root, rel))?.isFile()) errors.push(`缺少必要文档: ${rel}`);
  }
  const docsDir = join(root, 'docs');
  if (!safeStat(docsDir)?.isDirectory()) return;
  for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && !allowedDocsRootMd.has(entry.name)) {
      errors.push(`docs/${entry.name}: 禁止在 docs/ 根目录随手堆放文档。历史说明请迁入 docs/archive/，踩坑速记写入 docs/learnings/YYYY-MM/。`);
    }
  }
  for (const file of walkFiles(docsDir, f => f.endsWith('.md'))) {
    const rel = toPosix(relative(root, file));
    if (rel.startsWith('docs/research/') || rel.startsWith('docs/report/')) continue;
    const ok = /^docs\/(?:README|status|scenarios|runbook|glossary|history)\.md$/.test(rel)
      || /^docs\/plans\/[^/]+\.md$/.test(rel)
      || /^docs\/archive\/(?:README\.md|.+\.md)$/.test(rel)
      || /^docs\/learnings\/(?:README\.md|\d{4}-\d{2}\/[^/]+\.md)$/.test(rel);
    if (!ok) {
      errors.push(`${rel}: 文档位于未登记目录结构。请放入 docs/archive/、docs/learnings/YYYY-MM/ 或 .tmp/scratch/<任务名>/。`);
    }
  }
}

function checkBudgets(root, errors) {
  for (const [rel, { min, max }] of Object.entries(lineBudgets)) {
    const full = join(root, rel);
    if (!safeStat(full)?.isFile()) continue;
    const lines = countLines(readFileSync(full, 'utf8'));
    if (lines < min || lines > max) {
      errors.push(`${rel}: 行数 ${lines} 超出约定区间 [${min}, ${max}]。请把详细流水或对照表拆入 docs/archive/ 或 docs/research/，活文档只保留结论与链接。`);
    }
  }
}

function validateFragment(root, destination, fragment, ids, lineCountCache) {
  const lineMatch = fragment.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (lineMatch) {
    const full = join(root, destination);
    if (!safeStat(full)?.isFile()) return false;
    let total = lineCountCache.get(destination);
    if (total === undefined) {
      total = countLines(readFileSync(full, 'utf8'));
      lineCountCache.set(destination, total);
    }
    const start = Number(lineMatch[1]);
    const end = lineMatch[2] ? Number(lineMatch[2]) : start;
    return start >= 1 && start <= end && end <= total;
  }
  if (!ids.has(destination)) return true;
  return ids.get(destination).has(fragment) || ids.get(destination).has(fragment.toLowerCase());
}

function validateLinks(root, errors) {
  const allMd = [
    ...['README.md', 'AGENTS.md'].filter(f => safeStat(join(root, f))?.isFile()).map(f => join(root, f)),
    ...walkFiles(join(root, 'docs'), f => f.endsWith('.md')),
    ...walkFiles(join(root, 'contracts'), f => f.endsWith('.md')),
  ];
  const stripped = new Map();
  const ids = new Map();
  const lineCounts = new Map();
  for (const full of allMd) {
    const rel = toPosix(relative(root, full));
    const raw = readFileSync(full, 'utf8');
    const lines = stripFences(raw);
    stripped.set(rel, lines);
    ids.set(rel, headingIds(lines));
    lineCounts.set(rel, raw === '' ? 0 : raw.split(/\r?\n/).length);
  }

  const edges = new Map();
  let localLinks = 0;
  for (const [source, lines] of stripped) {
    if (source.startsWith('docs/research/') && !['docs/research/README.md', 'docs/research/readme-sources.md'].includes(source)) {
      continue;
    }
    const targets = new Set();
    const report = (line, msg) => errors.push(`${source}:${line}: ${msg}`);
    for (const { target, line } of extractLinks(lines, report)) {
      if (/^(?:https?:|mailto:)/i.test(target)) continue;
      if (/^(?:[A-Za-z]:|file:)/i.test(target)) {
        report(line, `禁止在文档中使用本机绝对路径链接: ${target}。请改用仓库相对链接或反引号行内路径。`);
        continue;
      }
      localLinks += 1;
      const [rawFile, ...fragmentParts] = target.split('#');
      let filePart;
      let fragment;
      try {
        filePart = decodeURIComponent(rawFile.split('?')[0]).replace(/\\([\\ ()])/g, '$1');
        fragment = decodeURIComponent(fragmentParts.join('#'));
      } catch {
        report(line, `链接编码无效: ${target}`);
        continue;
      }
      const absTarget = filePart
        ? resolve(root, filePart.startsWith('/') ? '.' : dirname(join(root, source)), filePart.replace(/^\//, ''))
        : join(root, source);
      const relTarget = relative(root, absTarget);
      if (relTarget === '..' || relTarget.startsWith(`..${sep}`) || isAbsolute(relTarget)) {
        report(line, `本地链接超出仓库范围: ${target}`);
        continue;
      }
      const destPosix = toPosix(relTarget);
      if (destPosix === '.tmp' || destPosix.startsWith('.tmp/')) {
        report(line, `禁止在活文档或踩坑记录中链接临时目录 .tmp/: ${target}。请改用反引号行内路径（\`${destPosix}\`）标明本地位置。`);
        continue;
      }
      if (destPosix === 'runs' || destPosix.startsWith('runs/')) {
        report(line, `禁止在仓库文档中用可点击链接指向忽略目录 runs/: ${target}。请改用反引号行内路径（\`${destPosix}\`）标明原件路径。`);
        continue;
      }
      const stat = safeStat(absTarget);
      if (!stat) {
        report(line, `链接目标不存在: ${target}`);
        continue;
      }
      let resolvedDest = destPosix;
      if (stat.isDirectory()) {
        const indexCandidate = ['README.md', 'index.md'].map(n => join(absTarget, n)).find(p => safeStat(p)?.isFile());
        if (indexCandidate) resolvedDest = toPosix(relative(root, indexCandidate));
        else if (fragment) {
          report(line, `目录链接不支持锚点片段: ${target}`);
          continue;
        }
      }
      targets.add(resolvedDest);
      if (fragment && !validateFragment(root, resolvedDest, fragment, ids, lineCounts)) {
        report(line, `链接锚点不存在: ${target}`);
      }
    }
    edges.set(source, targets);
  }
  return { markdownFiles: stripped.size, localLinks, edges, stripped };
}

function checkIndexCoverage(root, edges, errors) {
  const mustBeInDocsIndex = [
    'docs/status.md', 'docs/scenarios.md', 'docs/runbook.md', 'docs/glossary.md', 'docs/history.md',
    'docs/archive/README.md', 'docs/learnings/README.md', 'docs/research/README.md',
    'docs/research/readme-sources.md', 'docs/report/index.html',
    ...walkFiles(join(root, 'docs/plans'), f => f.endsWith('.md')).map(f => toPosix(relative(root, f))),
  ];
  const docsEdges = edges.get('docs/README.md') ?? new Set();
  for (const item of mustBeInDocsIndex) {
    if (!docsEdges.has(item)) errors.push(`${item}: 未收录到 docs/README.md 总索引。`);
  }

  const learningsEdges = edges.get('docs/learnings/README.md') ?? new Set();
  for (const full of walkFiles(join(root, 'docs/learnings'), f => f.endsWith('.md'))) {
    const rel = toPosix(relative(root, full));
    if (rel === 'docs/learnings/README.md') continue;
    if (!learningsEdges.has(rel)) errors.push(`${rel}: 未登记到 docs/learnings/README.md。`);
  }

  const archiveEdges = edges.get('docs/archive/README.md') ?? new Set();
  for (const full of walkFiles(join(root, 'docs/archive'), f => f.endsWith('.md'))) {
    const rel = toPosix(relative(root, full));
    if (rel === 'docs/archive/README.md') continue;
    if (!archiveEdges.has(rel)) errors.push(`${rel}: 未登记到 docs/archive/README.md。`);
  }
}

function checkReports(root, edges, errors) {
  const reportIndex = join(root, 'docs/report/index.html');
  if (!safeStat(reportIndex)?.isFile()) {
    errors.push('docs/report/index.html: 缺少阶段 4 静态 HTML 总览报告。');
    return;
  }
  if (!edges.get('README.md')?.has('docs/report/index.html')) {
    errors.push('README.md: 必须链接离线项目报告 docs/report/index.html。');
  }
  const htmlFiles = walkFiles(join(root, 'docs/report'), f => f.endsWith('.html'));
  const externalPatterns = [
    /<script\b[^>]*\bsrc\s*=\s*["']?[^\s"'>]+/i,
    /<link\b[^>]*\bhref\s*=\s*["']?(?:https?:|\/\/)[^\s"'>]*/i,
    /<(?:img|iframe|source|audio|video)\b[^>]*\bsrc\s*=\s*["']?(?:https?:|\/\/)[^\s"'>]*/i,
    /<a\b[^>]*\bhref\s*=\s*["']?(?:https?:|\/\/)[^\s"'>]*/i,
    /@import\s+(?:url\()?["']?(?:https?:|\/\/)[^\s"');]*/i,
    /url\(\s*["']?(?:https?:|\/\/)[^\s"')]+/i,
  ];
  for (const full of htmlFiles) {
    const rel = toPosix(relative(root, full));
    const html = readFileSync(full, 'utf8');
    for (const pattern of externalPatterns) {
      const match = html.match(pattern);
      if (match) errors.push(`${rel}: 静态离线报告禁止引用外部 URL（${match[0]}）。`);
    }
    for (const match of html.matchAll(/<(?:a|link)\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      const href = match[1];
      if (/^(?:#|https?:|mailto:|javascript:|data:)/i.test(href)) {
        if (/^(?:javascript:|data:)/i.test(href)) errors.push(`${rel}: 禁止危险协议链接 ${href}`);
        continue;
      }
      if (/^[A-Za-z]:|^file:/i.test(href)) {
        errors.push(`${rel}: 报告禁止绝对路径链接 ${href}`);
        continue;
      }
      const [filePart] = href.split('#');
      if (!filePart) continue;
      const target = resolve(dirname(full), filePart);
      const relToReport = toPosix(relative(join(root, 'docs/report'), target));
      if (relToReport.startsWith('..')) {
        errors.push(`${rel}: 离线报告内部链接超出 docs/report/ 范围：${href}`);
        continue;
      }
      if (!safeStat(target)?.isFile()) {
        errors.push(`${rel}: 离线报告链接目标不存在：${href}`);
      }
    }
  }
}

function checkReadmeRedlines(edges, stripped, errors) {
  const readmeLines = stripped.get('README.md');
  if (!readmeLines) return;
  if (!edges.get('README.md')?.has('docs/research/readme-sources.md')) {
    errors.push('README.md: 必须链接出处对照表 docs/research/readme-sources.md。');
  }

  const prose = readmeLines.map(line => line.replace(/`/g, '')).join('\n');
  for (const clause of prose.split(/[。\n；;！!]+/)) {
    if (!clause.trim()) continue;
    if (/(?:e1-binary-v3|二元尺子\s*v3|v3\s*(?:工作)?(?:评分器|尺子))/.test(clause) &&
        /(?<![未不非])(?:已冻结|冻结版|正式冻结|完成冻结|冻结采用)/.test(clause) &&
        !/(?:未冻结|不冻结|并非冻结|不是冻结|未通过冻结|不作冻结)/.test(clause)) {
      errors.push(`README.md: 措辞红线违反——e1-binary-v3 只能写「带边界采用」，不能写「已冻结」：${clause.trim()}`);
    }
    if (/(?:阶段\s*3|阶段三|状态驱动教师)/.test(clause) &&
        /(?<![未不非])(?:已采用|决定采用|采用候选)/.test(clause) &&
        !/(?:不采用|未采用|决定不采用|并未采用|拦下)/.test(clause)) {
      errors.push(`README.md: 措辞红线违反——阶段 3 必须写「不采用」：${clause.trim()}`);
    }
    if (/(?:AI\s*审核|Gemini\s*审核|Qwen\s*审核|跨家族盲核|盲核|模型审核)/.test(clause) &&
        /人工复核/.test(clause) &&
        !/(?:不是|不算|不作|不写作|不等于|并非|而非|非|不代替|不替代|不同于|取代不了)\s*(?:独立)?\s*人工复核/.test(clause)) {
      errors.push(`README.md: 措辞红线违反——AI 审核不能写成人工复核：${clause.trim()}`);
    }
  }

  const normalizeLead = line => line.trim().replace(/^(?:>\s*|[-*+]\s+|\d+[.)]\s+|\*\*)+/, '');
  const isProse = line => {
    const t = line.trim();
    return Boolean(t) && !t.startsWith('#') && !t.startsWith('|') && !t.startsWith('---') && !/^<a\b/i.test(t) && !/^<!--/.test(t);
  };
  let seenH1 = false;
  let expectingLead = false;
  let sectionLabel = '开场段落';
  for (let i = 0; i < readmeLines.length; i += 1) {
    const raw = readmeLines[i];
    if (!seenH1 && /^#\s+/.test(raw)) {
      seenH1 = true;
      expectingLead = true;
      sectionLabel = '开场首句';
      continue;
    }
    if (/^##\s+/.test(raw)) {
      expectingLead = true;
      sectionLabel = raw.trim();
      continue;
    }
    if (!expectingLead) continue;
    if (!raw.trim() || /^<a\b/i.test(raw.trim()) || /^<!--/.test(raw.trim())) continue;
    expectingLead = false;
    if (!isProse(raw)) continue;
    const lead = normalizeLead(raw);
    const bad = lead.match(/^(未|没|仅|不能)/);
    if (bad) {
      errors.push(`README.md:${i + 1}: ${sectionLabel}首句不能以「${bad[1]}」开头（请改为「建了什么 / 拦下了什么 / 暴露了什么」）：${lead}`);
    }
  }
}

/**
 * Validate repository documentation layout, budgets, links, index coverage, offline reports, and README redlines.
 * @param {string} [root]
 * @returns {{ markdownFiles: number, localLinks: number }}
 */
export function checkDocs(root = rootDir) {
  const absRoot = resolve(root);
  const errors = [];
  checkLayout(absRoot, errors);
  checkBudgets(absRoot, errors);
  const { markdownFiles, localLinks, edges, stripped } = validateLinks(absRoot, errors);
  checkIndexCoverage(absRoot, edges, errors);
  checkReports(absRoot, edges, errors);
  checkReadmeRedlines(edges, stripped, errors);
  if (errors.length) {
    throw new Error(`文档门禁检查未通过（${errors.length} 项）：\n${errors.join('\n')}`);
  }
  return { markdownFiles, localLinks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDocs(rootDir);
  console.log(`Docs OK (${result.markdownFiles} markdown files, ${result.localLinks} local links)`);
}
