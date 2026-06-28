import { useCallback, useRef } from 'react';

// Keyboard grid navigation for table entry forms.
// Arrow keys move between cells. Tab on the lastNavCol advances to the next
// row's first cell, or adds a new row when already on the last row.
export function useGridNav(colCount: number, lastNavCol: number, onAddRow: () => void) {
  const grid = useRef<(HTMLElement | null)[][]>([]);
  const pendingFocus = useRef<{ row: number; col: number } | null>(null);
  // Keep a stable ref to onAddRow so handleKeyDown doesn't need it as a dep.
  const addRowRef = useRef(onAddRow);
  addRowRef.current = onAddRow;

  const focusCell = (r: number, c: number): boolean => {
    const el = grid.current[r]?.[c];
    if (el) { el.focus(); return true; }
    return false;
  };

  // When navigating up/down to a row where the exact column slot is null
  // (e.g. Direction button absent for 'ref' entry type), find the nearest
  // non-null cell in that row rather than doing nothing.
  const focusCellOrNearest = (r: number, c: number): boolean => {
    if (focusCell(r, c)) return true;
    for (let d = 1; d < colCount; d++) {
      if (c + d < colCount && focusCell(r, c + d)) return true;
      if (c - d >= 0 && focusCell(r, c - d)) return true;
    }
    return false;
  };

  const handleKeyDown = useCallback(
    (row: number, col: number, rowCount: number) =>
      (e: React.KeyboardEvent) => {
        switch (e.key) {
          case 'ArrowUp':
            if (row > 0) { e.preventDefault(); focusCellOrNearest(row - 1, col); }
            break;
          case 'ArrowDown':
            if (row < rowCount - 1) { e.preventDefault(); focusCellOrNearest(row + 1, col); }
            break;
          case 'ArrowLeft':
            if (col > 0) {
              e.preventDefault();
              for (let c = col - 1; c >= 0; c--) { if (focusCell(row, c)) break; }
            }
            break;
          case 'ArrowRight':
            if (col < colCount - 1) {
              e.preventDefault();
              for (let c = col + 1; c < colCount; c++) { if (focusCell(row, c)) break; }
            }
            break;
          case 'Tab':
            if (!e.shiftKey && col === lastNavCol) {
              e.preventDefault();
              if (row < rowCount - 1) {
                focusCell(row + 1, 0);
              } else {
                pendingFocus.current = { row: rowCount, col: 0 };
                addRowRef.current();
              }
            }
            break;
        }
      },
    [colCount, lastNavCol],
  );

  // Call this in a useEffect watching entries.length so focus fires after
  // React has flushed the new row into the DOM.
  const flushPendingFocus = useCallback(() => {
    if (pendingFocus.current !== null) {
      const pf = pendingFocus.current;
      pendingFocus.current = null;
      requestAnimationFrame(() => focusCell(pf.row, pf.col));
    }
  }, []);

  // Returns a ref callback that registers the DOM element into the grid.
  // Use as: ref={cellRef(rowIndex, colIndex)}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cellRef = useCallback(
    (row: number, col: number): React.RefCallback<any> =>
      (el: HTMLElement | null) => {
        if (!grid.current[row]) grid.current[row] = new Array(colCount).fill(null);
        grid.current[row][col] = el;
      },
    [colCount],
  );

  return { handleKeyDown, flushPendingFocus, cellRef };
}
