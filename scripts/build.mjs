import { build } from 'esbuild';
import { mkdir, copyFile, chmod } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/viewer/viewer.ts'], outfile: 'dist/viewer.js', bundle: true, minify: true, target: 'es2022', format: 'iife', legalComments: 'inline' });
await copyFile('src/viewer/viewer.css', 'dist/viewer.css');
await build({ entryPoints: ['src/cli.ts', 'src/index.ts'], outdir: 'dist', bundle: true, platform: 'node', target: 'node22', format: 'esm', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
await chmod('dist/cli.js', 0o755);
// 浏览器 evaluate 回调必须独立于 Node 转译器；避免 tsx keepNames 注入闭包外的 __name。
await build({ entryPoints: ['scripts/benchmark.ts'], outfile: 'dist/benchmark.js', bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'esm', keepNames: false });
