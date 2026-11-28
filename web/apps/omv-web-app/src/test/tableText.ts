// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a table cell or row as a wide screen shows it. A narrow table stacks, and each of its cells
// then says its column's word before the value ("TableCell" "label"); that word is in the DOM at every
// width (hidden by CSS when wide, which jsdom does not apply), so a test that asserts a cell's exact
// text reads the value without it.

/** A cell's value: its text without the column's word a stacked row says before it. */
export function cellValue(cell: Element): string {
  const value = cell.querySelector(':scope > [data-slot="table-cell-value"]');
  return (value ?? cell).textContent;
}

/** A row's values, run together in column order as its text would be without the stacked words. */
export function rowValues(row: Element): string {
  return [...row.querySelectorAll(':scope > [data-slot="table-cell"]')]
    .map(cellValue)
    .join("");
}
