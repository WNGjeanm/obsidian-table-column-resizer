# Table Column Resizer — Performance Fork 1.2.1

修复 1.2.0 拖动列宽时撑大整张表格、导致阅读区域横向滚动的问题。

- 表格宽度限制在阅读区域内，已有超宽配置按比例适配。
- 拖动一列加宽 10px，右侧相邻列就缩窄 10px，表格总宽保持不变。
- 达到相邻列最小/最大宽度后停止拖动。
- 阅读区域缩窄、放宽时重新适配；临时窄窗口不会丢失列宽比例。
- 保留每帧合并更新、旧配置兼容及原始 MIT 许可证和作者署名。

下载 **table-column-resizer-performance-1.2.1.zip**，关闭插件并备份原目录，再将
ZIP 中 `table-column-resizer` 文件夹内的文件复制到同名插件目录，**保留 `data.json`**。
重新启用插件，在阅读视图使用。此次没有自动替换用户知识库内的安装。

31 项 Chromium 浏览器测试和 5 个表格 ID 兼容样例通过。另用原生鼠标输入验证了
600px 表格两列交换 80px 后总宽仍为 600px，并附前后截图和测量数据。
尚未在真实 Obsidian、全部主题/其他插件或真实触摸设备上验收。

This fixes the table growing beyond the reading content during column resizing.
Dragging redistributes the adjacent pair while the table width stays fixed.
Oversized legacy widths are fitted, and reading-pane resizing preserves preferred
proportions. Existing settings and table IDs remain compatible.

Install the ZIP into `.obsidian/plugins/table-column-resizer/` after disabling
and backing up the existing plugin. Keep `data.json`. The retained plugin ID
means upstream and this fork cannot run side by side.

This independent fork remains based on [bubble's original project](https://github.com/bubble-wu/obsidian-table-column-resizer).
Original copyright (`Copyright (c) 2024 SOLO Builder`), complete MIT license,
attribution and history are retained. The release ZIP and individual bundle carry
the original permission notice. No upstream endorsement is implied.
