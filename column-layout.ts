/** A drag changes two adjacent columns and never changes the table width. */
export interface ColumnLayout {
	columns: HTMLTableColElement[];
	widths: number[];
	preferredWidths: number[];
	totalWidth: number;
	preferredWidth: number;
	chromeWidth: number;
}

export function tableContainers(table: HTMLTableElement): HTMLElement[] {
	const containers: HTMLElement[] = [];
	for (let el = table.parentElement; el; el = el.parentElement) {
		containers.push(el);
		if (el === table.ownerDocument.body || el.matches('.markdown-preview-view, .markdown-reading-view')) break;
	}
	return containers;
}

/** Include outer reading bounds: an intrinsic-width table wrapper can itself overflow. */
export function availableTableWidth(table: HTMLTableElement): number {
	const win = table.ownerDocument.defaultView;
	let available = Infinity;
	for (const el of tableContainers(table)) {
		const style = win?.getComputedStyle(el);
		const content = el.clientWidth - (parseFloat(style?.paddingLeft ?? '') || 0) - (parseFloat(style?.paddingRight ?? '') || 0);
		const intrinsic = /^(inline|inline-block|inline-table|table)$/.test(style?.display ?? '') && !el.style.width;
		if (content > 0 && !intrinsic) available = Math.min(available, content);
		if (intrinsic && style?.maxWidth.endsWith('px')) available = Math.min(available, parseFloat(style.maxWidth));
		if (intrinsic && style?.maxWidth.endsWith('%') && el.parentElement) {
			const parentStyle = win?.getComputedStyle(el.parentElement);
			const parentContent = el.parentElement.clientWidth - (parseFloat(parentStyle?.paddingLeft ?? '') || 0) - (parseFloat(parentStyle?.paddingRight ?? '') || 0);
			if (parentContent > 0) available = Math.min(available, parentContent * parseFloat(style.maxWidth) / 100);
		}
	}
	const style = win?.getComputedStyle(table);
	return Math.max(0, available - (parseFloat(style?.marginLeft ?? '') || 0) - (parseFloat(style?.marginRight ?? '') || 0));
}

/** Preserve proportions, reserving feasible minimums without overflowing a narrow pane. */
function fitWidths(weights: number[], budget: number, minimum: number): number[] {
	if (!weights.length) return [];
	weights = weights.map(width => Number.isFinite(width) && width > 0 ? width : 1);
	const floor = Math.min(Math.max(0, minimum), budget / weights.length);
	const result = weights.map(() => 0);
	let pending = weights.map((_, i) => i);
	let remaining = budget;
	while (pending.length) {
		const sum = pending.reduce((total, i) => total + weights[i], 0);
		const small = pending.filter(i => remaining * weights[i] / sum < floor);
		if (!small.length) {
			pending.forEach(i => { result[i] = remaining * weights[i] / sum; });
			break;
		}
		const fixed = new Set(small);
		small.forEach(i => { result[i] = floor; remaining -= floor; });
		pending = pending.filter(i => !fixed.has(i));
	}
	// Keep the column sum exact despite floating-point distribution.
	result[result.length - 1] += budget - result.reduce((sum, width) => sum + width, 0);
	return result;
}

function applyWidths(layout: ColumnLayout) {
	layout.columns.forEach((col, i) => { col.style.width = `${layout.widths[i]}px`; });
}

export function fitLayoutToContainer(table: HTMLTableElement, layout: ColumnLayout, minimum: number): void {
	const total = Math.min(layout.preferredWidth, availableTableWidth(table));
	if (!Number.isFinite(total) || total <= 0 || Math.abs(total - layout.totalWidth) < 0.01) return;
	layout.totalWidth = total;
	layout.widths = fitWidths(layout.preferredWidths, Math.max(0, total - layout.chromeWidth), minimum);
	applyWidths(layout);
	table.style.width = `${total}px`;
}

export function restoreColumnWidths(table: HTMLTableElement, layout: ColumnLayout, saved: { [index: number]: number }, minimum: number): void {
	const weights = layout.widths.map((width, i) => Number.isFinite(saved[i]) && saved[i] > 0 ? saved[i] : width);
	layout.preferredWidths = weights.slice();
	layout.preferredWidth = weights.reduce((sum, width) => sum + width, 0) + layout.chromeWidth;
	layout.totalWidth = Math.min(layout.preferredWidth, availableTableWidth(table));
	layout.widths = fitWidths(weights, Math.max(0, layout.totalWidth - layout.chromeWidth), minimum);
	applyWidths(layout);
	table.style.width = `${layout.totalWidth}px`;
}

export function prepareColumnLayout(table: HTMLTableElement, minimum: number, saved?: { [index: number]: number }): ColumnLayout {
	const cells = Array.from(table.rows[0]?.cells ?? []);
	// Read all geometry before making any layout changes.
	const widths = cells.map(cell => cell.getBoundingClientRect().width);
	const totalWidth = table.getBoundingClientRect().width;
	const chromeWidth = Math.max(0, totalWidth - widths.reduce((sum, width) => sum + width, 0));
	const available = availableTableWidth(table);
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
		minWidth: '0', maxWidth: '100%',
	});
	const layout = { columns, widths, preferredWidths: widths.slice(), totalWidth, preferredWidth: totalWidth, chromeWidth };
	if (saved) restoreColumnWidths(table, layout, saved, minimum);
	else if (totalWidth > available) fitLayoutToContainer(table, layout, minimum);
	return layout;
}

export function columnResizeBounds(layout: ColumnLayout, index: number, minimum: number, maximum: number): { min: number; max: number } {
	const left = layout.widths[index], right = layout.widths[index + 1];
	const sum = left + right;
	const floor = Math.min(minimum, (layout.totalWidth - layout.chromeWidth) / layout.widths.length);
	// Already-small/large columns can move towards the limit without jumping on grab.
	return {
		min: Math.max(Math.min(floor, left), sum - Math.max(maximum, right)),
		max: Math.min(Math.max(maximum, left), sum - Math.min(floor, right)),
	};
}

export function updateColumnWidth(layout: ColumnLayout, index: number, width: number): void {
	if (!layout.columns[index + 1] || !Number.isFinite(width) || width <= 0 || Math.abs(layout.widths[index] - width) < 0.001) return;
	const adjacent = layout.widths[index] + layout.widths[index + 1] - width;
	if (adjacent <= 0) return;
	layout.widths[index] = width;
	layout.widths[index + 1] = adjacent;
	layout.preferredWidths[index] = width;
	layout.preferredWidths[index + 1] = adjacent;
	layout.columns[index].style.width = `${width}px`;
	layout.columns[index + 1].style.width = `${adjacent}px`;
}
