const { build } = require('esbuild');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mock = `
export class Plugin {
  saved = [];
  async loadData() { return null; }
  async saveData(data) { this.saved.push(JSON.parse(JSON.stringify(data))); }
  registerMarkdownPostProcessor() {}
  addSettingTab() {}
}
export class PluginSettingTab {}
export class MarkdownRenderChild { constructor(element) { this.containerEl = element; } }
export class Setting {}
`;

async function bundle(source) {
  const result = await build({
    ...(source ? { stdin: { contents: source, resolveDir: root, loader: 'js' } } : { entryPoints: [path.join(root, 'main.ts')] }),
    bundle: true, write: false,
    format: 'iife', globalName: 'TCR', plugins: [{ name: 'obsidian-test-host', setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'ts' }));
    } }],
  });
  return result.outputFiles[0].text;
}

async function launch() {
  const code = await bundle();
  const options = { headless: true };
  if (process.env.TCR_BROWSER_PATH) options.executablePath = process.env.TCR_BROWSER_PATH;
  else if (process.platform === 'win32' && fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) options.channel = 'msedge';
  const browser = await chromium.launch(options);
  return { browser, code };
}

async function pageFor(browser, code, rows = 30) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(`<style>
    body { font: 14px sans-serif; margin: 24px; }
    table { border-collapse: collapse; } th, td { border: 1px solid #aaa; padding: 6px; overflow-wrap: anywhere; }
  </style><table><thead><tr><th>Name</th><th>Description</th><th>Status</th></tr></thead><tbody>${
    Array.from({ length: rows }, (_, i) => `<tr><td>Row ${i}</td><td>中文内容与 long text to verify wrapping and stable adjacent columns ${i}</td><td>Ready</td></tr>`).join('')
  }</tbody></table>`);
  await page.addStyleTag({ path: path.join(root, 'styles.css') });
  await page.addScriptTag({ content: `HTMLElement.prototype.createEl = function(tag, options) {
    const element = this.ownerDocument.createElement(tag); element.className = options?.cls ?? ''; this.appendChild(element); return element;
  };` });
  await page.addScriptTag({ content: code });
  await page.evaluate(async () => {
    window.plugin = new TCR.default();
    plugin.app = { vault: { getAbstractFileByPath() { return {}; } } };
    await plugin.onload();
    window.table = document.querySelector('table');
    plugin.makeTableResizable(table, 'fixture.md');
    window.drag = (type, x, id = 1) => {
      const target = type === 'pointerdown' ? table.querySelector('.table-column-resizer') : document;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, pointerId: id }));
    };
    window.nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  });
  return page;
}

module.exports = { launch, pageFor, root, bundle };
