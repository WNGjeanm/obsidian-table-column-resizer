const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, pageFor, root } = require('../tests/harness.cjs');

(async () => {
  const { browser, code } = await launch();
  try {
    const page = await pageFor(browser, code, 5);
    await page.evaluate(async () => {
      await resetTable({ readingWidth: 600, saved: { 0: 200, 1: 200, 2: 200 } });
      const heading = document.createElement('p'); heading.id = 'fixture-label';
      heading.textContent = '拖动前：阅读区域 600px，表格总宽 600px'; pane.prepend(heading);
    });
    const measure = () => page.evaluate(() => ({ readingWidth: pane.clientWidth, tableWidth: table.getBoundingClientRect().width,
      scrollWidth: pane.scrollWidth, columns: Array.from(table.rows[0].cells).map(cell => cell.getBoundingClientRect().width) }));
    const before = await measure();
    await page.locator('.markdown-preview-view').screenshot({ path: path.join(root, 'docs/fixed-width-before.png') });
    const box = await page.locator('.table-column-resizer').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.evaluate(() => { document.getElementById('fixture-label').textContent = '拖动后：第一列 +80px，相邻列 -80px，表格总宽仍为 600px'; });
    const after = await measure();
    assert.ok(Math.abs(before.tableWidth - after.tableWidth) < 0.1);
    assert.ok(Math.abs(after.columns[0] - before.columns[0] - 80) < 0.2);
    assert.ok(after.scrollWidth <= after.readingWidth + 1);
    await page.locator('.markdown-preview-view').screenshot({ path: path.join(root, 'docs/fixed-width-after.png') });
    const evidence = { date: new Date().toISOString(), browser: browser.version(), fixture: 'Chromium with Obsidian API stub; native Playwright mouse input', before, after };
    fs.writeFileSync(path.join(root, 'docs/fixed-width-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
