const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { launch, pageFor, root, bundle } = require('../tests/harness.cjs');

const upstreamCommit = 'bb989d5d33bcc532981f4feaad43659bdefd995a';
const oldSource = execFileSync('git', ['show', `${upstreamCommit}:main.js`], { cwd: root, encoding: 'utf8' });

(async () => {
  const { browser, code } = await launch();
  try {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    const upstreamCode = await bundle(oldSource);
    const samples = [];
    for (const rows of [50, 300, 1000]) {
      for (const [variant, source] of [['upstream-1.1.0', upstreamCode], ['performance-1.2.0', code]]) {
        const page = await pageFor(browser, source, rows);
        await page.evaluate(() => { drag('pointerdown', 100); table.getBoundingClientRect(); });
        const session = await page.context().newCDPSession(page);
        await session.send('Performance.enable');
        const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const before = await metrics();
        const result = await page.evaluate(async () => {
          let calls = 0, updateMs = 0, cellMutations = 0, styleMutations = 0, layoutFlushMs = 0;
          const original = plugin.setColumnWidth.bind(plugin);
          plugin.setColumnWidth = (...args) => {
            const start = performance.now(); original(...args); updateMs += performance.now() - start; calls++;
          };
          const observer = new MutationObserver(records => {
            styleMutations += records.length;
            cellMutations += records.filter(r => /^(TD|TH)$/.test(r.target.tagName)).length;
          });
          observer.observe(table, { subtree: true, attributes: true, attributeFilter: ['style'] });
          const wallStart = performance.now();
          for (let frame = 0; frame < 60; frame++) {
            for (let i = 0; i < 8; i++) drag('pointermove', 100 + ((frame * 8 + i) % 220));
            await nextFrame();
            const start = performance.now(); table.getBoundingClientRect(); layoutFlushMs += performance.now() - start;
          }
          await Promise.resolve(); observer.disconnect();
          const result = { frames: 60, events: 480, calls, cellMutations, styleMutations, elapsedMs: +(performance.now() - wallStart).toFixed(2),
            updateMs: +updateMs.toFixed(2), layoutFlushMs: +layoutFlushMs.toFixed(2) };
          drag('pointerup', 139);
          return result;
        });
        const after = await metrics();
        result.layoutDurationMs = +((after.LayoutDuration - before.LayoutDuration) * 1000).toFixed(2);
        result.styleDurationMs = +((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000).toFixed(2);
        samples.push({ rows, variant, ...result });
        console.log(JSON.stringify(samples.at(-1)));
        if (variant.startsWith('performance') && (result.calls > 60 || result.cellMutations !== 0)) throw new Error('Drag complexity regression');
        if (rows === 300 && variant.startsWith('performance')) {
          await page.screenshot({ path: path.join(root, 'docs/performance-preview.png') });
        }
        await page.close();
      }
    }
    const report = { date: new Date().toISOString(), browser: browser.version(), upstreamCommit,
      methodology: 'Synthetic pointer-event bursts: 8 events per animation frame, 60 frames, 3 columns of wrapping text. One warm setup, one run per case. updateMs measures JS inside setColumnWidth only; layoutFlushMs measures explicit post-frame geometry reads and is not total rendering time. layoutDurationMs/styleDurationMs are CDP Performance counter deltas over the drag, including release. elapsedMs includes frame waiting. MutationObserver instrumentation affects timings. This is a Chromium fixture, not an Obsidian FPS measurement.', samples };
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/benchmark-results.json'), JSON.stringify(report, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
