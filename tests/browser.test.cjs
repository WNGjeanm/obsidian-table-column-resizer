const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, pageFor } = require('./harness.cjs');
let browser, code;
before(async () => ({ browser, code } = await launch()));
after(async () => browser?.close());

async function check(callback, rows) {
  const page = await pageFor(browser, code, rows);
  try { return await callback(page); } finally { await page.close(); }
}

test('a burst of 100 moves produces one column update and no cell mutations', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100);
    let calls = 0;
    const original = plugin.setColumnWidth.bind(plugin);
    plugin.setColumnWidth = (...args) => { calls++; original(...args); };
    const changes = [];
    const observer = new MutationObserver(records => changes.push(...records));
    observer.observe(table, { attributes: true, subtree: true, attributeFilter: ['style'] });
    for (let i = 0; i < 100; i++) drag('pointermove', 101 + i);
    const beforeFrame = calls;
    await nextFrame(); await Promise.resolve(); observer.disconnect();
    return { beforeFrame, calls, cells: changes.filter(r => /^(TD|TH)$/.test(r.target.tagName)).length };
  });
  assert.deepEqual(r, { beforeFrame: 0, calls: 1, cells: 0 });
}, 1000));

test('release before the next frame applies the release position and saves once', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100); const start = table.rows[0].cells[0].getBoundingClientRect().width;
    drag('pointermove', 120); drag('pointerup', 160); await nextFrame();
    return { width: parseFloat(table.querySelector('col').style.width), expected: Math.round(start + 60),
      saves: plugin.saved.length, busy: document.body.classList.contains('table-resizing') };
  });
  assert.equal(r.width, r.expected); assert.equal(r.saves, 1); assert.equal(r.busy, false);
}));

test('saved widths restore on a fresh render without changing the table ID', () => check(async page => {
  const r = await page.evaluate(() => {
    const id = plugin.getTableId(table, 'fixture.md');
    drag('pointerdown', 100); drag('pointerup', 180);
    const saved = plugin.tableWidths[id];
    const fresh = document.createElement('table');
    fresh.innerHTML = table.innerHTML; fresh.querySelectorAll('colgroup, .table-column-resizer').forEach(el => el.remove());
    document.body.appendChild(fresh); plugin.makeTableResizable(fresh, 'fixture.md');
    return { sameId: id === plugin.getTableId(fresh, 'fixture.md'), saved,
      restored: Array.from(fresh.querySelectorAll('col')).map(col => parseFloat(col.style.width)) };
  });
  assert.equal(r.sameId, true);
  Object.values(r.saved).forEach((width, index) => assert.ok(Math.abs(r.restored[index] - width) < 0.01));
}));

test('legacy 1.1.0 widths restore and stale per-cell constraints are cleared once', () => check(async page => {
  const r = await page.evaluate(() => {
    plugin.tableWidths[plugin.getTableId(table, 'fixture.md')] = { 0: 240, 1: 300 };
    Array.from(table.rows).forEach(row => Object.assign(row.cells[0].style, { width: '180px', minWidth: '180px', maxWidth: '180px' }));
    plugin.applySavedWidths(table, 'fixture.md');
    return { widths: Array.from(table.querySelectorAll('col')).slice(0, 2).map(c => c.style.width),
      remaining: Array.from(table.rows).some(row => row.cells[0].style.minWidth) };
  });
  assert.deepEqual(r.widths, ['240px', '300px']); assert.equal(r.remaining, false);
}));

test('limits clamp widths and repeated movement at the limit produces no style writes', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100); drag('pointermove', 10000); await nextFrame();
    const max = table.querySelector('col').style.width;
    let changes = 0; const observer = new MutationObserver(r => { changes += r.length; });
    observer.observe(table, { subtree: true, attributes: true, attributeFilter: ['style'] });
    drag('pointermove', 11000); await nextFrame(); await Promise.resolve(); observer.disconnect();
    drag('pointermove', -10000); await nextFrame();
    return { max, min: table.querySelector('col').style.width, changes };
  });
  assert.deepEqual(r, { max: '500px', min: '50px', changes: 0 });
}));

test('unrelated pointers cannot resize or end the active drag', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100, 7); const before = table.querySelector('col').style.width;
    drag('pointermove', 250, 8); drag('pointerup', 250, 8); await nextFrame();
    return { same: before === table.querySelector('col').style.width, busy: document.body.classList.contains('table-resizing'), saves: plugin.saved.length };
  });
  assert.deepEqual(r, { same: true, busy: true, saves: 0 });
}));

for (const trigger of ['pointercancel', 'blur', 'lostpointercapture']) {
  test(`${trigger} ends the drag and flushes the pending width`, () => check(async page => {
    const r = await page.evaluate(async trigger => {
      drag('pointerdown', 100); drag('pointermove', 170);
      if (trigger === 'pointercancel') drag(trigger, 170);
      else (trigger === 'blur' ? window : table.querySelector('.table-column-resizer')).dispatchEvent(new Event(trigger));
      await nextFrame();
      return { busy: document.body.classList.contains('table-resizing'), saves: plugin.saved.length };
    }, trigger);
    assert.deepEqual(r, { busy: false, saves: 1 });
  }));
}

test('disabling during a drag cancels frames and removes handles', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100); drag('pointermove', 150); await plugin.setEnabled(false); await nextFrame();
    return { busy: document.body.classList.contains('table-resizing'), handles: table.querySelectorAll('.table-column-resizer').length };
  });
  assert.deepEqual(r, { busy: false, handles: 0 });
}));

test('detaching a table during a drag does not save stale content', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100); table.remove(); drag('pointermove', 200); drag('pointerup', 200); await nextFrame();
    return { saves: plugin.saved.length, busy: document.body.classList.contains('table-resizing') };
  });
  assert.deepEqual(r, { saves: 0, busy: false });
}));

test('resizing grows the table by the drag delta and keeps adjacent columns stable', () => check(async page => {
  const r = await page.evaluate(() => {
    const before = Array.from(table.rows[0].cells).map(c => c.getBoundingClientRect().width);
    const total = table.getBoundingClientRect().width;
    drag('pointerdown', 100); drag('pointerup', 180);
    return { before, after: Array.from(table.rows[0].cells).map(c => c.getBoundingClientRect().width), delta: table.getBoundingClientRect().width - total };
  });
  assert.ok(Math.abs(r.delta - 80) < 1);
  assert.ok(Math.abs(r.after[1] - r.before[1]) < 1);
  assert.ok(Math.abs(r.after[2] - r.before[2]) < 1);
}));

test('native mouse drag tracks the handle and saves after release', () => check(async page => {
  const handle = page.locator('.table-column-resizer').first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 10, { steps: 8 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => plugin.saved.length), 1);
  assert.equal(await page.evaluate(() => document.body.classList.contains('table-resizing')), false);
}));

test('unload removes handles and pending callbacks without saving', () => check(async page => {
  const r = await page.evaluate(async () => {
    drag('pointerdown', 100); drag('pointermove', 180); plugin.onunload(); await nextFrame();
    return { saves: plugin.saved.length, handles: table.querySelectorAll('.table-column-resizer').length, busy: document.body.classList.contains('table-resizing') };
  });
  assert.deepEqual(r, { saves: 0, handles: 0, busy: false });
}));

test('secondary-window documents use their own event target, frames and cleanup', () => check(async page => {
  const r = await page.evaluate(async () => {
    const iframe = document.createElement('iframe'); document.body.appendChild(iframe);
    const win = iframe.contentWindow, doc = iframe.contentDocument;
    win.HTMLElement.prototype.createEl = HTMLElement.prototype.createEl;
    doc.body.innerHTML = '<table><tr><th>First</th><th>Second</th></tr><tr><td>One</td><td>Two</td></tr></table>';
    const other = doc.querySelector('table'); plugin.makeTableResizable(other, 'secondary.md');
    other.querySelector('.table-column-resizer').dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 5 }));
    const ownBody = doc.body.classList.contains('table-resizing');
    const mainBody = document.body.classList.contains('table-resizing');
    doc.dispatchEvent(new win.PointerEvent('pointermove', { clientX: 220, pointerId: 5 }));
    await new Promise(resolve => win.requestAnimationFrame(resolve));
    doc.dispatchEvent(new win.PointerEvent('pointerup', { clientX: 220, pointerId: 5 }));
    const saves = plugin.saved.length;
    plugin.onunload();
    return { ownBody, mainBody, saves, busy: doc.body.classList.contains('table-resizing'), handles: other.querySelectorAll('.table-column-resizer').length };
  });
  assert.deepEqual(r, { ownBody: true, mainBody: false, saves: 1, busy: false, handles: 0 });
}));

test('saved widths wait for detached or hidden sections to become measurable', () => check(async page => {
  const r = await page.evaluate(async () => {
    const fresh = document.createElement('table');
    fresh.innerHTML = '<tr><th>First column</th><th>Second column</th></tr><tr><td>One</td><td>Two</td></tr>';
    const id = plugin.getTableId(fresh, 'hidden.md'); plugin.tableWidths[id] = { 0: 180 };
    plugin.makeTableResizable(fresh, 'hidden.md');
    const detached = fresh.querySelectorAll('col').length;
    fresh.style.display = 'none'; document.body.appendChild(fresh); await nextFrame();
    const hidden = fresh.querySelectorAll('col').length;
    fresh.style.display = ''; await nextFrame(); await nextFrame();
    return { detached, hidden, first: fresh.querySelector('col')?.style.width,
      second: fresh.rows[0].cells[1].getBoundingClientRect().width };
  });
  assert.equal(r.detached, 0); assert.equal(r.hidden, 0); assert.equal(r.first, '180px'); assert.ok(r.second > 0);
}));

test('a click without a drag does not change saved widths', () => check(async page => {
  assert.equal(await page.evaluate(() => { drag('pointerdown', 100); drag('pointerup', 100); return plugin.saved.length; }), 0);
}));

test('the renderer lifecycle cancels restoration for an abandoned section', () => check(async page => {
  const r = await page.evaluate(async () => {
    const section = document.createElement('div'); section.innerHTML = '<table><tr><th>First</th><th>Last</th></tr></table>';
    const fresh = section.querySelector('table');
    plugin.tableWidths[plugin.getTableId(fresh, 'abandoned.md')] = { 0: 160 };
    const children = [];
    plugin.processTables(section, { sourcePath: 'abandoned.md', addChild: c => children.push(c) });
    children[0].onunload(); document.body.appendChild(section); await nextFrame(); await nextFrame();
    return { children: children.length, columns: fresh.querySelectorAll('col').length };
  });
  assert.deepEqual(r, { children: 1, columns: 0 });
}));
