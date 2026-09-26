# fast-deep-equal · 深比较怎样提前返回

阅读目标：理解 `fast-deep-equal@3.1.3` 默认 CommonJS 入口如何比较数组、普通对象和特殊值。运行 `npm run demo`，打开 `artifacts/fast-deep-equal/map.html`；本说明随产物交付时，直接打开同目录 `map.html`。

导读：主题 → 按输入形态分流 → equal → 数组按位置递归 → 原始源码。可另沿“对象先查键，再查值”检查第二个递归调用点。两条递归关系分别计数；图中数量不表示运行次数。

地图含 16 个节点、3 个实体、6 条关系和 4 条局部流程。原始入口的 46 行完整保存在 `examples/fast-deep-equal/source/index.cjs`，与锁文件依赖的 `index.js` 逐字节一致；没有运行该项目的安装、构建或启动脚本。完整 MIT 许可和署名随 HTML 的许可节点内嵌，并另附 LICENSE。

已核对源码、调用点和提前返回分支；自动语义探针覆盖数组次序、NaN、RegExp flags、自定义 valueOf 短路、symbol 键和异常传播。自定义 valueOf/toString 的具体实现保留未知。未覆盖 ES6、React 入口，不保证循环对象终止，不提供性能排名。

这是源码与语义检查通过的阅读候选，尚未完成浏览器目视审阅和独立读者试用。`validation.json` 记录源码核验，`build-receipt.json` 记录产物指纹，`provenance.json` 记录包名和版本。源文件或锁定版本变化时需重新审阅地图，不得只修改指纹。

独立分享只需 HTML，其中包含所选源码及许可。公网地址需自行静态托管；本地文件路径不是分享 URL。
