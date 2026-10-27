/** Column-level layout state. A drag writes two elements, regardless of row count. */
export interface ColumnLayout {
	columns: HTMLTableColElement[];
	widths: number[];
	totalWidth: number;
}

export function prepareColumnLayout(table: HTMLTableElement): ColumnLayout {
	const cells = Array.from(table.rows[0]?.cells ?? []);
	// Read all geometry before making any layout changes.
	const widths = cells.map(cell => cell.getBoundingClientRect().width);
	const totalWidth = table.getBoundingClientRect().width;
	const group = table.ownerDocument.createElement('colgroup');
	group.setAttribute('data-tcr-columns', 'true');
	const columns = widths.map(width => {
		const col = table.ownerDocument.createElement('col');
		col.style.width = `${width}px`;
		group.appendChild(col);
		return col;
	});
	// Standard Markdown tables have no colgroup. Reuse no authored column layout.
	table.querySelectorAll(':scope > colgroup[data-tcr-columns]').forEach(el => el.remove());
	const firstSection = Array.from(table.children).find(el => /^(THEAD|TBODY|TFOOT|TR)$/.test(el.tagName));
	table.insertBefore(group, firstSection ?? null);
	// Clear only the triplet written by upstream 1.1.0; do this once, never per move.
	Array.from(table.rows).forEach(row => Array.from(row.cells).forEach(cell => {
		if (cell.style.width && cell.style.width === cell.style.minWidth && cell.style.width === cell.style.maxWidth) {
			cell.style.removeProperty('width');
			cell.style.removeProperty('min-width');
			cell.style.removeProperty('max-width');
		}
	}));
	Object.assign(table.style, {
		tableLayout: 'fixed', width: `${totalWidth}px`, boxSizing: 'border-box',
		minWidth: '0', maxWidth: 'none',
	});
	return { columns, widths, totalWidth };
}

export function updateColumnWidth(table: HTMLTableElement, layout: ColumnLayout, index: number, width: number): void {
	if (!layout.columns[index] || !Number.isFinite(width) || width <= 0 || layout.widths[index] === width) return;
	layout.totalWidth += width - layout.widths[index];
	layout.widths[index] = width;
	layout.columns[index].style.width = `${width}px`;
	table.style.width = `${layout.totalWidth}px`;
}
