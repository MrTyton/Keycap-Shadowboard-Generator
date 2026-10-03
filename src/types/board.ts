export type ClickMode = 'normal' | 'half' | 'spacebar';

export interface BoardConfig {
  boardWidth: number;   // mm
  boardHeight: number;  // mm
  thickness: number;    // mm
  cellSize: number;     // mm
}

export const DEFAULT_CONFIG: BoardConfig = {
  boardWidth: 308,
  boardHeight: 308,
  thickness: 4,
  cellSize: 14,
};

/**
 * Key for a normal (grid-aligned) hole at cell (r, c).
 * The hole is centred in the cell square.
 */
export function normalCellKey(r: number, c: number): string {
  return `n:${r},${c}`;
}

/**
 * Key for a corner-intersection hole centred at grid corner (i, j).
 * The hole spans the corner of all 4 adjacent cells.
 * Valid: i ∈ [1, rows-1], j ∈ [1, cols-1].
 */
export function halfCornerKey(i: number, j: number): string {
  return `hc:${i},${j}`;
}

/** centred on vertical grid line j, spanning row r.
 * The hole takes the right half of cell (r, j-1) and the left half of cell (r, j).
 * Valid: j ∈ [1, cols-1], r ∈ [0, rows-1].
 */
export function halfLRKey(r: number, j: number): string {
  return `hlr:${r},${j}`;
}

/**
 * Key for a half top-bottom hole centred on horizontal grid line i, spanning col c.
 * The hole takes the bottom half of cell (i-1, c) and the top half of cell (i, c).
 * Valid: i ∈ [1, rows-1], c ∈ [0, cols-1].
 */
export function halfTBKey(i: number, c: number): string {
  return `htb:${i},${c}`;
}

/** Parse any hole key back to its prefix, and two numeric coordinates. */
export function parseAnyKey(key: string): { prefix: string; a: number; b: number } {
  const colon = key.indexOf(':');
  const parts = key.slice(colon + 1).split(',');
  return { prefix: key.slice(0, colon), a: Number(parts[0]), b: Number(parts[1]) };
}

export function boardCols(config: BoardConfig): number {
  return Math.floor(config.boardWidth / config.cellSize);
}

export function boardRows(config: BoardConfig): number {
  return Math.floor(config.boardHeight / config.cellSize);
}
