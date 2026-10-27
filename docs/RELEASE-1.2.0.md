# Table Column Resizer — Performance Fork 1.2.0

Independent performance fork maintained by WNGjeanm, based on
[bubble's Table Column Resizer 1.1.0](https://github.com/bubble-wu/obsidian-table-column-resizer).
Original MIT copyright (`Copyright (c) 2024 SOLO Builder`), permission text and
Git history are retained. This is not an official upstream release.

## Changes / 改动

- Merge pointer moves into one width update per animation frame.
- Update a column and the table width instead of every cell in the column.
- Skip unchanged widths; flush the last release position before saving.
- Restore old width data without measuring detached/hidden sections as zero.
- Clean up capture loss, cancellation, blur, disable and unload; use the table's own window.

## Install / 安装

Download **table-column-resizer-performance-1.2.0.zip**. Disable the original
plugin, back up `.obsidian/plugins/table-column-resizer/`, and copy the ZIP's
`table-column-resizer` contents into that directory. **Keep `data.json`.**
Re-enable the plugin and use reading view. The retained plugin ID means this
fork replaces the upstream installation; they cannot run together. Update from
this fork to retain these changes. Restore your backup to roll back.

关闭原插件并备份插件目录，将 ZIP 中的文件复制到同名插件目录，保留已有
`data.json`，再启用。无需修改笔记。此分支未自动安装到你的知识库。

## Verification / 验证

Browser regression tests, five table-ID compatibility samples, TypeScript/build
checks, ZIP allowlist and byte comparisons, version consistency and original MIT
license checks. See the repository's performance report and raw benchmark data.

In the synthetic 480-event/60-frame benchmark, update calls fall from 480 to 60;
the optimized implementation submits 120 style mutations regardless of whether
the fixture has 50, 300 or 1,000 rows. This does not represent an FPS multiplier.

Real Obsidian/theme/plugin/touch compatibility has not been manually verified.
The browser must still lay out and paint long tables. Live Preview is outside
the supported scope. Individual install files, original LICENSE, attribution,
installation instructions and SHA256SUMS are also attached.
