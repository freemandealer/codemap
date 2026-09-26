import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const out = 'artifacts/minifs';
await mkdir(out, { recursive: true });
const run = (...args) => execFileSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
console.log(run('validate', 'examples/minifs/map.codemap.json', '--repo', '.', '--out', `${out}/validation.json`));
console.log(run('build', 'examples/minifs/map.codemap.json', '--validation', `${out}/validation.json`, '--out', `${out}/map.html`));
console.log(run('inspect', `${out}/map.html`));
await copyFile('examples/minifs/map.codemap.json', `${out}/map.codemap.json`);
await writeFile(`${out}/README.md`, `# MiniFS 代码地图\n\n直接打开 map.html。此教学例子解释打开、操作表分派和失败清理，不是 Linux VFS。\n\n推荐阅读：主题 → 打开请求的责任 → minifs_open → 通过操作表分派 → 源码。\n\n支持离线缩放、搜索、阅读大纲、关系成员、源码和证据。图中 7 个实体、20 个节点、4 条实体关系和 9 条局部流程分别计数。\n\n发布：将 map.html 放到现有静态站点，在阅读器里使用分享按钮取得节点链接与 iframe 示例。本地 file:// 路径不能作为公网链接。\n\nvalidation.json 核验源码与 IR 一致性，不证明自然语言解释；build-receipt.json 记录可重现构建的指纹。\n`);

const architectureOut = 'artifacts/minifs-architecture';
await mkdir(architectureOut, { recursive: true });
console.log(run('validate', 'examples/minifs/architecture.codemap.json', '--repo', '.', '--out', `${architectureOut}/validation.json`));
console.log(run('build', 'examples/minifs/architecture.codemap.json', '--validation', `${architectureOut}/validation.json`, '--repo', '.', '--out', `${architectureOut}/map.html`));
console.log(run('inspect', `${architectureOut}/map.html`));
await copyFile('examples/minifs/architecture.codemap.json', `${architectureOut}/map.codemap.json`);
await writeFile(`${architectureOut}/README.md`, `# MiniFS 架构地图\n\n直接打开 map.html。主视角为架构，按打开接口、后端协议与实现、文件槽位和名称空间分区；连线展示调用、分派、接口依赖和共享对象读写。模块内部保留打开函数的局部流程。\n\n与 ../minifs/map.html 的流程视角使用同一份教学源码，不是 Linux VFS。导读从主题进入后端接口，再到实现源码；模块排列和导读顺序不表示执行时序。\n\nvalidation.json 核验源码与 IR 一致性，不证明自然语言解释；build-receipt.json 记录构建指纹。分享时把 map.html 放到自己的静态站点。\n`);

const selfOut = 'artifacts/codemap-build';
await mkdir(selfOut, { recursive: true });
console.log(run('validate', 'examples/codemap-build/map.codemap.json', '--repo', '.', '--out', `${selfOut}/validation.json`));
console.log(run('build', 'examples/codemap-build/map.codemap.json', '--validation', `${selfOut}/validation.json`, '--repo', '.', '--out', `${selfOut}/map.html`));
console.log(run('inspect', `${selfOut}/map.html`));
await copyFile('examples/codemap-build/map.codemap.json', `${selfOut}/map.codemap.json`);
await copyFile('examples/codemap-build/README.md', `${selfOut}/README.md`);

for (const name of ['fast-deep-equal', 'json-schema-traverse']) {
  const example = `examples/${name}`, output = `artifacts/${name}`;
  await mkdir(output, { recursive: true });
  console.log(run('validate', `${example}/map.codemap.json`, '--repo', '.', '--out', `${output}/validation.json`));
  console.log(run('build', `${example}/map.codemap.json`, '--validation', `${output}/validation.json`, '--repo', '.', '--out', `${output}/map.html`));
  console.log(run('inspect', `${output}/map.html`));
  for (const file of ['map.codemap.json', 'README.md']) await copyFile(`${example}/${file}`, `${output}/${file}`);
  await copyFile(`${example}/source/LICENSE`, `${output}/LICENSE`);
  await copyFile(`${example}/source/provenance.json`, `${output}/provenance.json`);
}
