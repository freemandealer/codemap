import { cp, mkdir, copyFile, writeFile, readFile, chmod, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const target = resolve('artifacts/codemap-skill/codemap');
await mkdir(target, { recursive: true });
await cp('skills/codemap', target, { recursive: true });
await mkdir(join(target, 'schemas'), { recursive: true });
await mkdir(join(target, 'examples/minifs'), { recursive: true });
await copyFile('schemas/codemap.schema.json', join(target, 'schemas/codemap.schema.json'));
await copyFile('dist/cli.js', join(target, 'scripts/codemap.mjs'));
await copyFile('dist/viewer.js', join(target, 'scripts/viewer.js'));
await copyFile('dist/viewer.css', join(target, 'scripts/viewer.css'));
await chmod(join(target, 'scripts/codemap.mjs'), 0o755);
await copyFile('examples/minifs/minifs.c', join(target, 'examples/minifs/minifs.c'));
await copyFile('examples/minifs/map.codemap.json', join(target, 'examples/minifs/map.codemap.json'));
await copyFile('examples/minifs/architecture.codemap.json', join(target, 'examples/minifs/architecture.codemap.json'));
const dependency = JSON.parse(await readFile('node_modules/ajv/package.json', 'utf8'));
await writeFile(join(target, 'scripts/THIRD-PARTY-NOTICES.txt'), `Standalone CLI includes Ajv ${dependency.version} and its dependencies.\n\n` + (await Promise.all(['ajv', 'fast-uri', 'fast-deep-equal', 'json-schema-traverse', 'require-from-string'].map(async name => {
  for (const filename of ['LICENSE', 'LICENSE.md']) { try { return `\n--- ${name} ---\n${await readFile(`node_modules/${name}/${filename}`, 'utf8')}`; } catch {} }
  throw Error(`Missing license: ${name}`);
}))).join('\n'));
// Prove this is portable: no node_modules or repository-relative files are available in the smoke-test copy.
const temp = await mkdtemp(join(tmpdir(), 'codemap-skill-'));
try {
  const clean = join(temp, 'codemap'); await cp(target, clean, { recursive: true });
  const run = (...args) => execFileSync(process.execPath, [join(clean, 'scripts/codemap.mjs'), ...args], { encoding: 'utf8', cwd: temp });
  const examples = [];
  for (const file of ['map.codemap.json', 'architecture.codemap.json']) {
    const input = join(clean, 'examples/minifs', file);
    run('validate', input, '--repo', clean, '--out', join(temp, 'validation.json'));
    run('build', input, '--validation', join(temp, 'validation.json'), '--out', join(temp, 'map.html'));
    const inspected = JSON.parse(run('inspect', join(temp, 'map.html'), '--json'));
    examples.push({ file, artifactBytes: inspected.bytes, compilerVersion: inspected.compilerVersion });
  }
  await writeFile(resolve('artifacts/skill-package-check.json'), JSON.stringify({ passed: true, checks: ['standalone validate', 'standalone build', 'standalone inspect'], artifactBytes: examples[0].artifactBytes, compilerVersion: examples[0].compilerVersion, examples }, null, 2) + '\n');
} finally { await rm(temp, { recursive: true, force: true }); }
console.log(`独立 Skill 已生成并通过无 node_modules 环境检查：${target}`);
