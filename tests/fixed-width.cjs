// Loaded by browser.test.cjs so every regression uses the same browser fixture.
module.exports = function fixedWidthTests(test, assert, check) {
  test('an initially oversized table fits the reading content before dragging', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 600, tableWidth: 1800 });
      await nextFrame();
      return { width: table.getBoundingClientRect().width, scroll: pane.scrollWidth, available: pane.clientWidth };
    });
    assert.ok(r.width <= 600.5, JSON.stringify(r)); assert.ok(r.scroll <= r.available + 1, JSON.stringify(r));
  }));

  test('oversized 1.2.0 saved widths are fitted without changing their source data', () => check(async page => {
    const r = await page.evaluate(async () => {
      const saved = { 0: 900, 1: 600, 2: 300 };
      await resetTable({ readingWidth: 600, saved });
      const widths = Array.from(table.rows[0].cells).map(c => c.getBoundingClientRect().width);
      return { width: table.getBoundingClientRect().width, ratio: widths[0] / widths[2], raw: plugin.tableWidths[plugin.getTableId(table, 'fixture.md')], saves: plugin.saved.length };
    });
    assert.ok(r.width <= 600.5); assert.ok(Math.abs(r.ratio - 3) < 0.03);
    assert.deepEqual(r.raw, { 0: 900, 1: 600, 2: 300 }); assert.equal(r.saves, 0);
  }));

  test('a full-width table stays fixed through a +10 drag and repeated extreme drags', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 600, saved: { 0: 200, 1: 200, 2: 200 } });
      const before = table.getBoundingClientRect().width;
      const left = table.rows[0].cells[0].getBoundingClientRect().width;
      drag('pointerdown', 100); drag('pointerup', 110);
      const delta = table.rows[0].cells[0].getBoundingClientRect().width - left;
      for (let i = 0; i < 12; i++) { drag('pointerdown', 100); drag('pointerup', i % 2 ? -10000 : 10000); }
      await nextFrame();
      return { before, after: table.getBoundingClientRect().width, delta, scroll: pane.scrollWidth, available: pane.clientWidth };
    });
    assert.ok(Math.abs(r.delta - 10) < 0.1, JSON.stringify(r));
    assert.ok(Math.abs(r.before - r.after) < 0.1, JSON.stringify(r));
    assert.ok(r.scroll <= r.available + 1, JSON.stringify(r));
  }));

  test('the right neighbor minimum stops further widening', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 900, saved: { 0: 200, 1: 80, 2: 200 } });
      const before = table.getBoundingClientRect().width;
      drag('pointerdown', 100); drag('pointerup', 200);
      return { widths: Array.from(table.querySelectorAll('col')).map(c => parseFloat(c.style.width)), delta: table.getBoundingClientRect().width - before };
    });
    assert.deepEqual(r.widths, [230, 50, 200]); assert.ok(Math.abs(r.delta) < 0.1);
  }));

  test('the right neighbor maximum stops further narrowing', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 1200, saved: { 0: 200, 1: 450, 2: 200 } });
      drag('pointerdown', 100); drag('pointerup', -1000);
      return Array.from(table.querySelectorAll('col')).map(c => parseFloat(c.style.width));
    });
    assert.deepEqual(r, [150, 500, 200]);
  }));

  test('dragging the second boundary only changes columns two and three', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 900, saved: { 0: 200, 1: 200, 2: 200 } });
      table.querySelectorAll('.table-column-resizer')[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
      drag('pointerup', 125);
      return Array.from(table.querySelectorAll('col')).map(c => parseFloat(c.style.width));
    });
    assert.deepEqual(r, [200, 225, 175]);
  }));

  for (const intrinsicWrapper of [false, true]) {
    test(`shrinking and expanding the reading pane fits the table (intrinsic wrapper: ${intrinsicWrapper})`, () => check(async page => {
      const r = await page.evaluate(async intrinsicWrapper => {
        await resetTable({ readingWidth: 800, saved: { 0: 400, 1: 250, 2: 150 }, intrinsicWrapper });
        await nextFrame(); await nextFrame();
        pane.style.width = '360px'; await nextFrame(); await nextFrame();
        const narrow = { table: table.getBoundingClientRect().width, scroll: pane.scrollWidth, client: pane.clientWidth };
        pane.style.width = '800px'; await nextFrame(); await nextFrame();
        return { narrow, wider: table.getBoundingClientRect().width, saves: plugin.saved.length };
      }, intrinsicWrapper);
      assert.ok(r.narrow.table <= 360.5, JSON.stringify(r));
      assert.ok(r.narrow.scroll <= r.narrow.client + 1, JSON.stringify(r));
      assert.ok(r.wider > 790 && r.wider <= 800.5, JSON.stringify(r)); assert.equal(r.saves, 0);
    }));
  }

  test('padding and overflowing intrinsic wrappers do not enlarge the reading bounds', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 600, tableWidth: 1800, intrinsicWrapper: true });
      pane.style.padding = '20px'; pane.style.boxSizing = 'border-box';
      await nextFrame(); await nextFrame();
      return { width: table.getBoundingClientRect().width, scroll: pane.scrollWidth, client: pane.clientWidth };
    });
    assert.ok(r.width <= 560.5, JSON.stringify(r)); assert.ok(r.scroll <= r.client + 1, JSON.stringify(r));
  }));

  test('long nonbreaking text wraps without a horizontal reading-pane scrollbar', () => check(async page => {
    const r = await page.evaluate(async () => {
      table.rows[1].cells[1].textContent = 'https://example.test/' + 'LongIdentifier'.repeat(100);
      await resetTable({ readingWidth: 400, saved: { 0: 1000, 1: 1000, 2: 1000 } });
      drag('pointerdown', 100); drag('pointerup', 1000); await nextFrame();
      return { table: table.getBoundingClientRect().width, scroll: pane.scrollWidth, client: pane.clientWidth };
    });
    assert.ok(r.table <= 400.5, JSON.stringify(r)); assert.ok(r.scroll <= r.client + 1, JSON.stringify(r));
  }));

  test('a pane narrower than all configured minimums still fits the table', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 100, saved: { 0: 200, 1: 200, 2: 200 } });
      drag('pointerdown', 100); drag('pointerup', 1000); await nextFrame();
      return { table: table.getBoundingClientRect().width, scroll: pane.scrollWidth, client: pane.clientWidth };
    });
    assert.ok(r.table <= 100.5, JSON.stringify(r)); assert.ok(r.scroll <= r.client + 1, JSON.stringify(r));
  }));

  test('a temporary narrow pane does not erase saved column proportions', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 900, saved: { 0: 300, 1: 200, 2: 100 } });
      pane.style.width = '100px'; await nextFrame(); await nextFrame();
      // Merely clicking a constrained boundary must not replace the preferred proportions.
      drag('pointerdown', 100); drag('pointerup', 100);
      pane.style.width = '900px'; await nextFrame(); await nextFrame();
      return Array.from(table.querySelectorAll('col')).map(c => parseFloat(c.style.width));
    });
    r.forEach((width, i) => assert.ok(Math.abs(width - [300, 200, 100][i]) < 0.02, JSON.stringify(r)));
  }));

  test('an intrinsic wrapper with a percentage maximum is also respected', () => check(async page => {
    const r = await page.evaluate(async () => {
      await resetTable({ readingWidth: 600, saved: { 0: 300, 1: 300, 2: 300 }, intrinsicWrapper: true });
      table.parentElement.style.maxWidth = '75%'; await nextFrame(); await nextFrame();
      return { width: table.getBoundingClientRect().width, scroll: table.parentElement.scrollWidth, client: table.parentElement.clientWidth };
    });
    assert.ok(r.width <= 450.5, JSON.stringify(r)); assert.ok(r.scroll <= r.client + 1, JSON.stringify(r));
  }));
};
