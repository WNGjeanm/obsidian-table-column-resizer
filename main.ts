import { Plugin, MarkdownPostProcessorContext, MarkdownRenderChild, PluginSettingTab, Setting, SettingDefinitionItem } from 'obsidian';
import { ColumnLayout, prepareColumnLayout, updateColumnWidth } from './column-layout';

interface PluginSettings {
	enabled: boolean;
	minColumnWidth: number;
	maxColumnWidth: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
	enabled: true,
	minColumnWidth: 50,
	maxColumnWidth: 500,
};

/** Upper bound on remembered tables per file; keeps data.json from growing without limit. */
const MAX_TABLE_ENTRIES_PER_FILE = 100;

/** Saved column widths, keyed by a stable per-table id. */
interface SavedTableWidths {
	[tableId: string]: { [columnIndex: number]: number };
}

interface PluginData {
	settings?: Partial<PluginSettings>;
	tableWidths?: SavedTableWidths;
}

export default class TableColumnResizerPlugin extends Plugin {
	settings: PluginSettings;
	tableWidths: SavedTableWidths = {};

	private isResizing = false;
	private currentTable: HTMLTableElement | null = null;
	private currentSourcePath = '';
	private currentColumn = -1;
	private startX = 0;
	private startWidth = 0;
	private layouts = new WeakMap<HTMLTableElement, ColumnLayout>();
	private dragDocument: Document | null = null;
	private dragWindow: Window | null = null;
	private dragHandle: Element | null = null;
	private pointerId = -1;
	private frame: number | null = null;
	private pendingWidth: number | null = null;
	private changed = false;
	private documents = new Set<Document>();
	private pendingRestores = new Map<HTMLTableElement, ResizeObserver>();

	async onload() {
		const raw: unknown = await this.loadData();
		const data = (raw ?? {}) as PluginData;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? {});
		this.tableWidths = data.tableWidths ?? {};
		this.pruneStaleWidths();

		this.registerMarkdownPostProcessor((element, context) => {
			this.processTables(element, context);
		});

		this.addSettingTab(new TableColumnResizerSettingTab(this.app, this));
	}

	onunload() {
		// Clean up drag state in case the plugin is disabled mid-drag.
		this.endResize();
		this.removeAllHandles();
		this.documents.clear();
		this.clearPendingRestores();
	}

	processTables(element: HTMLElement, context: MarkdownPostProcessorContext) {
		if (!this.settings.enabled) return;
		element.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
			if (table.hasAttribute('data-resizable')) return;
			this.makeTableResizable(table, context.sourcePath);
			const child = new MarkdownRenderChild(table);
			child.onunload = () => {
				this.pendingRestores.get(table)?.disconnect();
				this.pendingRestores.delete(table);
				if (this.currentTable === table) this.endResize();
			};
			context.addChild(child);
		});
	}

	makeTableResizable(table: HTMLTableElement, sourcePath: string) {
		if (table.hasAttribute('data-resizable')) return;
		// HTML tables with authored column groups/spans need a different column model.
		if (table.querySelector('colgroup:not([data-tcr-columns]), [colspan], [rowspan]')) return;
		table.setAttribute('data-resizable', 'true');
		this.documents.add(table.ownerDocument);

		this.applySavedWidths(table, sourcePath);

		const headerRow = table.rows[0];
		if (!headerRow) return;

		// Attach one handle per header cell (except the last column, whose
		// right edge is the table edge).
		Array.from(headerRow.cells).forEach((cell) => {
			if (cell.cellIndex === headerRow.cells.length - 1) return;

			const handle = cell.createEl('div', { cls: 'table-column-resizer' });
			handle.addEventListener('pointerdown', (e) => {
				this.onHandlePointerDown(e, table, cell.cellIndex, sourcePath);
			});
		});
	}

	applySavedWidths(table: HTMLTableElement, sourcePath: string) {
		const widths = this.tableWidths[this.getTableId(table, sourcePath)];
		if (!widths) return;
		// Markdown post-processors can receive detached/hidden sections. Measuring
		// them now would freeze untouched columns at zero; wait for real geometry.
		if (!table.isConnected || table.getBoundingClientRect().width <= 0) {
			if (!this.pendingRestores.has(table)) {
				const observer = new ResizeObserver(() => {
					if (this.settings.enabled && table.isConnected && table.getBoundingClientRect().width > 0) {
						this.applySavedWidths(table, sourcePath);
					}
				});
				this.pendingRestores.set(table, observer);
				observer.observe(table);
			}
			return;
		}
		this.pendingRestores.get(table)?.disconnect();
		this.pendingRestores.delete(table);

		const entries = Object.entries(widths) as [string, number][];
		entries.forEach(([columnIndex, width]) => {
			this.setColumnWidth(table, Number.parseInt(columnIndex, 10), width);
		});
	}

	private onHandlePointerDown(e: PointerEvent, table: HTMLTableElement, columnIndex: number, sourcePath: string) {
		if (this.isResizing || e.button !== 0) return;
		e.preventDefault();
		if (this.pendingRestores.has(table)) this.applySavedWidths(table, sourcePath);

		this.isResizing = true;
		this.currentTable = table;
		this.currentSourcePath = sourcePath;
		this.currentColumn = columnIndex;
		this.startX = e.clientX;
		this.pointerId = e.pointerId;
		this.dragDocument = table.ownerDocument;
		this.dragWindow = table.ownerDocument.defaultView;
		this.dragHandle = e.currentTarget as Element;
		this.pendingWidth = null;
		this.changed = false;

		const headerCell = table.rows[0]?.cells[columnIndex];
		this.startWidth = headerCell ? headerCell.getBoundingClientRect().width : this.settings.minColumnWidth;

		// Fixed layout makes the browser respect the exact widths we set.
		if (!this.layouts.has(table)) this.layouts.set(table, prepareColumnLayout(table));
		table.setAttribute('data-resizing', 'true');
		this.dragDocument.body.classList.add('table-resizing');

		// Capture so the drag keeps tracking when the pointer leaves the window,
		// and works identically for mouse, touch and stylus.
		if (this.dragHandle) {
			try {
				this.dragHandle.setPointerCapture(e.pointerId);
			} catch {
				// Best-effort; the document listeners below still work.
			}
		}

		this.dragDocument.addEventListener('pointermove', this.handlePointerMove);
		this.dragDocument.addEventListener('pointerup', this.handlePointerUp);
		this.dragDocument.addEventListener('pointercancel', this.handlePointerCancel);
		this.dragHandle?.addEventListener('lostpointercapture', this.handleCaptureLost);
		this.dragWindow?.addEventListener('blur', this.handleCaptureLost);
	}

	handlePointerMove = (e: PointerEvent) => {
		if (!this.isResizing || !this.currentTable || e.pointerId !== this.pointerId) return;

		const deltaX = e.clientX - this.startX;
		const newWidth = Math.max(
			this.settings.minColumnWidth,
			Math.min(Math.round(this.startWidth + deltaX), this.settings.maxColumnWidth)
		);

		this.pendingWidth = newWidth;
		if (this.frame === null && this.dragWindow) {
			this.frame = this.dragWindow.requestAnimationFrame(() => {
				this.frame = null;
				this.flushWidth();
			});
		}
	};

	private flushWidth() {
		if (!this.currentTable || this.pendingWidth === null) return;
		if (this.currentTable.isConnected) {
			const before = this.layouts.get(this.currentTable)?.widths[this.currentColumn];
			this.setColumnWidth(this.currentTable, this.currentColumn, this.pendingWidth);
			this.changed = this.changed || before !== this.pendingWidth;
		}
		this.pendingWidth = null;
	}

	handlePointerUp = (e: PointerEvent) => {
		if (!this.isResizing || e.pointerId !== this.pointerId) return;
		// Apply the release coordinate even when it precedes the scheduled frame.
		if (e.clientX !== this.startX || this.pendingWidth !== null || this.changed) this.handlePointerMove(e);
		this.finishResize();
	};

	private handlePointerCancel = (e: PointerEvent) => {
		if (e.pointerId === this.pointerId) this.finishResize();
	};

	private handleCaptureLost = () => this.finishResize();

	private finishResize() {
		if (!this.isResizing) return;
		this.flushWidth();
		const table = this.currentTable;
		const sourcePath = this.currentSourcePath;
		const changed = this.changed;
		this.endResize();
		if (table?.isConnected && changed) {
			void this.saveWidths(table, sourcePath);
		}
	}

	private endResize() {
		this.isResizing = false;
		if (this.frame !== null) this.dragWindow?.cancelAnimationFrame(this.frame);
		this.frame = null;
		this.pendingWidth = null;
		this.dragDocument?.removeEventListener('pointermove', this.handlePointerMove);
		this.dragDocument?.removeEventListener('pointerup', this.handlePointerUp);
		this.dragDocument?.removeEventListener('pointercancel', this.handlePointerCancel);
		this.dragDocument?.body.classList.remove('table-resizing');
		this.dragWindow?.removeEventListener('blur', this.handleCaptureLost);
		this.dragHandle?.removeEventListener('lostpointercapture', this.handleCaptureLost);
		try {
			if (this.dragHandle?.hasPointerCapture(this.pointerId)) this.dragHandle.releasePointerCapture(this.pointerId);
		} catch { /* The host may already have removed the handle. */ }
		this.dragDocument = null;
		this.dragWindow = null;
		this.dragHandle = null;
		this.pointerId = -1;

		if (this.currentTable) {
			this.currentTable.removeAttribute('data-resizing');
		}
		this.currentTable = null;
		this.currentSourcePath = '';
		this.currentColumn = -1;
	}

	setColumnWidth(table: HTMLTableElement, columnIndex: number, width: number) {
		let layout = this.layouts.get(table);
		if (!layout) {
			layout = prepareColumnLayout(table);
			this.layouts.set(table, layout);
		}
		updateColumnWidth(table, layout, columnIndex, width);
	}

	async saveWidths(table: HTMLTableElement, sourcePath: string) {
		const tableId = this.getTableId(table, sourcePath);
		const headerRow = table.rows[0];
		if (!headerRow) return;

		const widths: { [columnIndex: number]: number } = {};
		this.layouts.get(table)?.widths.forEach((width, index) => { widths[index] = width; });

		if (Object.keys(widths).length === 0) {
			delete this.tableWidths[tableId];
		} else {
			this.tableWidths[tableId] = widths;
		}

		await this.saveData({ settings: this.settings, tableWidths: this.tableWidths });
	}

	/**
	 * Stable id: source path + hash of the table's text content.
	 * Widths survive restarts and edits elsewhere in the note; they reset
	 * when the table's own content changes.
	 */
	getTableId(table: HTMLTableElement, sourcePath: string): string {
		const content = table.textContent ?? '';
		let hash = 5381;
		for (let i = 0; i < content.length; i++) {
			hash = ((hash << 5) + hash + content.charCodeAt(i)) >>> 0;
		}
		return `${sourcePath}::${hash.toString(36)}`;
	}

	/** Drop saved widths for files that no longer exist, and cap entries per file. */
	private pruneStaleWidths() {
		const ids = Object.keys(this.tableWidths);
		if (ids.length === 0) return;

		const idsByFile = new Map<string, string[]>();
		for (const id of ids) {
			const sep = id.lastIndexOf('::');
			const path = sep === -1 ? id : id.slice(0, sep);
			if (!path) continue; // untitled/new files: keep
			const list = idsByFile.get(path);
			if (list) list.push(id);
			else idsByFile.set(path, [id]);
		}

		let removed = false;
		idsByFile.forEach((fileIds, path) => {
			if (!this.app.vault.getAbstractFileByPath(path)) {
				fileIds.forEach((id) => delete this.tableWidths[id]);
				removed = true;
				return;
			}
			if (fileIds.length > MAX_TABLE_ENTRIES_PER_FILE) {
				fileIds
					.slice(0, fileIds.length - MAX_TABLE_ENTRIES_PER_FILE)
					.forEach((id) => delete this.tableWidths[id]);
				removed = true;
			}
		});

		if (removed) {
			void this.saveData({ settings: this.settings, tableWidths: this.tableWidths });
		}
	}

	async saveSettings() {
		await this.saveData({ settings: this.settings, tableWidths: this.tableWidths });
	}

	async setEnabled(value: boolean) {
		this.settings.enabled = value;
		if (!value) {
			this.finishResize();
			this.removeAllHandles();
			this.clearPendingRestores();
		}
		await this.saveSettings();
	}

	private clearPendingRestores() {
		this.pendingRestores.forEach(observer => observer.disconnect());
		this.pendingRestores.clear();
	}

	/** Make disabling take effect immediately instead of waiting for the next render. */
	private removeAllHandles() {
		this.documents.forEach(doc => {
			doc.querySelectorAll('table[data-resizable]').forEach((table) => {
				table.removeAttribute('data-resizable');
			});
			doc.querySelectorAll('.table-column-resizer').forEach((handle) => {
				handle.remove();
			});
		});
	}
}

class TableColumnResizerSettingTab extends PluginSettingTab {
	plugin: TableColumnResizerPlugin;

	/** Declarative settings (Obsidian 1.13.0+): powers the settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Enable column resizing',
				desc: 'Drag column edges to resize tables in reading view.',
				control: {
					type: 'toggle',
					key: 'enabled',
					defaultValue: DEFAULT_SETTINGS.enabled,
				},
			},
			{
				name: 'Minimum column width',
				desc: 'Smallest allowed column width, in pixels.',
				control: {
					type: 'number',
					key: 'minColumnWidth',
					defaultValue: DEFAULT_SETTINGS.minColumnWidth,
					validate: (value) => (value > 0 ? undefined : 'Must be a positive number.'),
				},
			},
			{
				name: 'Maximum column width',
				desc: 'Largest allowed column width, in pixels.',
				control: {
					type: 'number',
					key: 'maxColumnWidth',
					defaultValue: DEFAULT_SETTINGS.maxColumnWidth,
					validate: (value) => (value > 0 ? undefined : 'Must be a positive number.'),
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof PluginSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'enabled':
				await this.plugin.setEnabled(Boolean(value));
				return;
			case 'minColumnWidth':
				this.plugin.settings.minColumnWidth = Number(value);
				break;
			case 'maxColumnWidth':
				this.plugin.settings.maxColumnWidth = Number(value);
				break;
			default:
				return;
		}
		await this.plugin.saveSettings();
	}

	/** Legacy imperative settings UI for Obsidian versions before 1.13.0. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable column resizing')
			.setDesc('Drag column edges to resize tables in reading view.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					await this.plugin.setEnabled(value);
				})
			);

		new Setting(containerEl)
			.setName('Minimum column width')
			.setDesc('Smallest allowed column width, in pixels.')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.minColumnWidth))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isNaN(parsed) && parsed > 0) {
							this.plugin.settings.minColumnWidth = parsed;
							if (this.plugin.settings.maxColumnWidth < parsed) {
								this.plugin.settings.maxColumnWidth = parsed;
							}
							await this.plugin.saveSettings();
							this.display();
						}
					})
			);

		new Setting(containerEl)
			.setName('Maximum column width')
			.setDesc('Largest allowed column width, in pixels.')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxColumnWidth))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (!Number.isNaN(parsed) && parsed > 0) {
							this.plugin.settings.maxColumnWidth = parsed;
							if (this.plugin.settings.minColumnWidth > parsed) {
								this.plugin.settings.minColumnWidth = parsed;
							}
							await this.plugin.saveSettings();
							this.display();
						}
					})
			);
	}
}
