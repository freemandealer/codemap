#!/usr/bin/env node
// Development checkout launcher. package:skill replaces this with the standalone bundle.
try { await import('../../../dist/cli.js'); }
catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('CodeMap 尚未构建；请在 CodeMap 仓库运行 npm ci && npm run build，或使用 package:skill 生成的独立包。');
    process.exitCode = 5;
  } else throw error;
}
