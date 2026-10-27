# Table Column Resizer — Performance Fork

[中文](#中文说明) · [English](#english)

**Independent performance fork maintained by [WNGjeanm](https://github.com/WNGjeanm).**
Based on [Table Column Resizer by bubble](https://github.com/bubble-wu/obsidian-table-column-resizer).
Original copyright: **Copyright (c) 2024 SOLO Builder**. MIT license and Git history retained.
See [LICENSE](LICENSE) and [attribution](THIRD_PARTY_NOTICES.md).

## 中文说明

在 Obsidian 阅读视图中拖动标准 Markdown 表格的表头边缘，调整列宽；列宽保存在插件
配置中，笔记仍然是普通 Markdown。

这是独立维护的性能分支，并非原作者发布的版本，也未作为新插件提交到社区目录。

### 性能改动

- 每个动画帧只应用最新鼠标位置，合并高频 Pointer Events。
- 通过 `<colgroup>` 调整列宽，每次更新只写入列和表格两个元素，避免逐行修改整列。
- 初始化时一次性读取几何尺寸，再明确设置固定布局和表格总宽度。
- 到达宽度上限或宽度未变时，不再重复写样式。
- 松手时立即应用最后位置；取消、失焦、丢失捕获、禁用时清理拖动状态。
- 使用表格所属窗口的事件与动画帧，兼容独立窗口的文档上下文。
- 保留上游表格 ID 算法及配置格式，兼容已有的 `data.json`。

拖动一列时表格总宽度随之变化，其他列保持原宽度。首次初始化仍需读取表头并清理
旧版单元格约束；浏览器依然需要重新布局和绘制表格，超长表格的开销不会消失。

测试条件、原始数据和验证边界见 [性能报告](docs/PERFORMANCE.md)。

### 安装与升级

1. 从[本 Fork 的 Releases](https://github.com/WNGjeanm/obsidian-table-column-resizer/releases/latest)
   下载 `table-column-resizer-performance-1.2.0.zip`。
2. 在 Obsidian 中关闭原插件，备份原来的 `.obsidian/plugins/table-column-resizer/` 文件夹。
3. 解压后，将 `table-column-resizer` 文件夹中的文件复制到同名插件目录。保留已有
   `data.json`，无需修改笔记。
4. 重新启用插件，在阅读视图拖动表头右边缘。最后一列沿用上游行为，不设置拖动手柄。

本分支保留 `table-column-resizer` 插件 ID 以兼容已有配置，因此与上游版本使用同一个
插件目录，不能同时启用。后续请从本 Fork 更新；社区目录的更新来自原项目，可能覆盖
本分支。回退时关闭插件并恢复备份即可。

设置沿用上游：启用开关、最小列宽（默认 50px）、最大列宽（默认 500px）。
达到上限后列宽会停止增加，可按需要调大设置。

### 范围与限制

- 支持阅读视图中的普通 Markdown 表格；不包含实时预览编辑模式。
- 支持鼠标；保留触摸和笔事件代码，尚未在真实触摸设备上验证。
- 不处理含合并单元格或自定义 `<colgroup>` 的 HTML 表格。
- 同一笔记中内容完全相同的表格仍共享列宽；修改表格文字后使用新的表格 ID。
- 自动化测试在 Chromium 浏览器的 Obsidian API 桩环境中运行，不能代替真实
  Obsidian、不同主题和其他插件的兼容性测试。

## English

This independent MIT-licensed fork improves the continuous-drag path of bubble's
Table Column Resizer 1.1.0. It coalesces pointer moves with `requestAnimationFrame`,
replaces per-row cell writes with column-level layout, and flushes the last
position on release. Resizing changes the table's total width and keeps the other
columns stable. Existing table IDs and persisted widths remain compatible.

Download the ZIP from **this fork's Releases**, disable the existing plugin, back
up its folder, and replace the files in `.obsidian/plugins/table-column-resizer/`.
Keep your `data.json`. Enable the plugin and drag a header edge in reading view.
The retained plugin ID means upstream and fork cannot run side by side. Update
from this fork; upstream community-directory updates may replace it.

The upstream author, original copyright notice, full MIT license, history and
demonstration asset remain credited. This is not an upstream-endorsed release.
See [attribution](THIRD_PARTY_NOTICES.md) and [performance evidence](docs/PERFORMANCE.md).

### Development / 开发

Use Node.js 22 or later. Clone this repository with its history (the benchmark and
license checks use the upstream fork commit).

```sh
npm ci
npx playwright install chromium
npm run build
npm test
node scripts/verify-table-id.js
npm run benchmark
npm run package
```

On Windows the test harness can use installed Microsoft Edge. Set
`TCR_BROWSER_PATH` to select another Chromium executable. The installable package
has no bundled third-party runtime dependencies; `obsidian` is provided by the host.

The inherited automatic-release workflow is disabled on this fork. A proposed
Node 22 test workflow is available at [docs/ci-example.yml](docs/ci-example.yml);
installing it requires a GitHub credential with `workflow` scope. See the
[validation record](docs/VALIDATION.md) for the checks actually run.

### Original upstream demonstration / 上游原始演示

This unchanged animation illustrates upstream usage; it is not a recording of
the performance fork or benchmark.

![Original demonstration by the upstream project](screenshots/demo.gif)
