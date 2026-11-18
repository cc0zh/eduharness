import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (...parts) => join(root, ...parts);
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
  const file = join(path, entry.name);
  if (entry.isSymbolicLink()) throw new Error(`unexpected symlink: ${file}`);
  return entry.isDirectory() ? walk(file) : ['.mjs', '.js', '.cjs', '.ts'].includes(extname(file)) ? [file] : [];
});

await init;
const files = ['contracts', 'src', 'config'].flatMap(dir => walk(at(dir)));
for (const file of files) {
  const [top, owner] = relative(root, file).split(sep);
  const teacher = top === 'src' && owner === 'teacher';
  for (const item of parse(readFileSync(file, 'utf8'), file)[0]) {
    if (item.d === -2) continue;
    const specifier = item.n;
    const check = (ok, destination) => { if (!ok) throw new Error(`${relative(root, file)} cannot import ${destination}`); };
    check(specifier, 'a computed import');
    if (specifier.startsWith('@earendil-works/pi-ai')) check(file === at('src', 'models.mjs') || file === at('src', 'offline.mjs'), specifier);
    if (top === 'contracts' && owner === 'judge' && ['@sinclair/typebox', '@sinclair/typebox/value'].includes(specifier)) continue;
    if (specifier.startsWith('node:')) {
      check(!teacher && top !== 'config' && (top !== 'contracts' || ['node:crypto', 'node:test', 'node:fs', 'node:assert/strict'].includes(specifier)), specifier);
      continue;
    }
    if (!specifier.startsWith('.') && !specifier.startsWith('file:') && !specifier.startsWith('/')) {
      check(top !== 'contracts' && top !== 'config' && (!teacher || specifier === '@earendil-works/pi-agent-core'), specifier);
      continue;
    }
    const to = realpathSync(specifier.startsWith('file:') ? fileURLToPath(specifier) : resolve(dirname(file), specifier));
    const [domain, target] = relative(root, to).split(sep);
    if (top === 'contracts') check(domain === 'contracts' && (target === owner || target === 'core' || (owner === 'judge' && ['teacher', 'dataset'].includes(target))), specifier);
    if (top === 'config') check(domain === 'config', specifier);
    if (teacher) check(domain === 'config' || (domain === 'src' && target === 'teacher') || (domain === 'contracts' && ['core', 'teacher'].includes(target)), specifier);
  }
}
console.log(`Import boundaries OK (${files.length} files)`);
