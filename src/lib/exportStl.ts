import { type BoardConfig, parseAnyKey } from '../types/board';

// ─── Internal types ─────────────────────────────────────────────────────────

interface Rect2D {
    x: number; // left edge, mm
    y: number; // front edge, mm
    w: number; // mm
    h: number; // mm
}

type Vec3 = [number, number, number];

// ─── Key → hole rectangle ────────────────────────────────────────────────────

/**
 * Convert the enabled-cell key set into a list of 2-D axis-aligned hole
 * rectangles (all in millimetres, in the XY plane of the board).
 *
 * Coordinate mapping (matches the SVG layout):
 *   X = board-width direction  (column index increases left→right)
 *   Y = board-height direction (row index increases top→bottom)
 *   Z = board thickness        (bottom face at z=0, top face at z=T)
 */
function keysToHoles(enabledCells: ReadonlySet<string>, cellSize: number): Rect2D[] {
    const holes: Rect2D[] = [];
    for (const key of enabledCells) {
        const { prefix, a, b } = parseAnyKey(key);
        let x: number, y: number;
        switch (prefix) {
            // n:r,c  — full cell, top-left at (c·cs, r·cs)
            case 'n':
                x = b * cellSize;
                y = a * cellSize;
                break;
            // hlr:r,j — straddles vertical boundary j at row r; centred on x = j·cs
            case 'hlr':
                x = b * cellSize - cellSize / 2;
                y = a * cellSize;
                break;
            // htb:i,c — straddles horizontal boundary i at col c; centred on y = i·cs
            case 'htb':
                x = b * cellSize;
                y = a * cellSize - cellSize / 2;
                break;
            // hc:i,j  — corner at (j·cs, i·cs); centred on both boundaries
            case 'hc':
                x = b * cellSize - cellSize / 2;
                y = a * cellSize - cellSize / 2;
                break;
            default:
                continue;
        }
        holes.push({ x, y, w: cellSize, h: cellSize });
    }
    return holes;
}

// ─── Binary STL helpers ──────────────────────────────────────────────────────

/** Write one triangle (normal + 3 vertices + attribute) into a DataView. */
function writeTri(
    dv: DataView,
    off: number,
    nx: number, ny: number, nz: number,
    v0: Vec3, v1: Vec3, v2: Vec3,
): number {
    dv.setFloat32(off, nx, true); off += 4;
    dv.setFloat32(off, ny, true); off += 4;
    dv.setFloat32(off, nz, true); off += 4;
    for (const v of [v0, v1, v2]) {
        dv.setFloat32(off, v[0], true); off += 4;
        dv.setFloat32(off, v[1], true); off += 4;
        dv.setFloat32(off, v[2], true); off += 4;
    }
    dv.setUint16(off, 0, true); off += 2;
    return off;
}

// ─── Main export ─────────────────────────────────────────────────────────────
//
// All geometry is derived from a 2-D grid.  Every grid cell is classified as
// solid (board material) or void (hole, or outside the board boundary).
// For each SOLID cell we emit:
//   • top face and bottom face (2 tris each)
//   • a wall quad on any side where the neighbour is void
//
// This guarantees:
//   • No duplicate faces between adjacent holes
//   • No phantom interior walls inside overlapping holes
//   • No coincident faces at the board boundary for edge-touching holes
//   • A fully manifold, watertight mesh

export function exportStl(config: BoardConfig, enabledCells: ReadonlySet<string>): void {
    const { boardWidth: W, boardHeight: H, thickness: T, cellSize } = config;
    const holes = keysToHoles(enabledCells, cellSize);

    // ── 1. Build coordinate grid ───────────────────────────────────────────
    // Include board corners plus every hole edge as a grid line.
    const xSet = new Set<number>([0, W]);
    const ySet = new Set<number>([0, H]);
    for (const h of holes) {
        xSet.add(h.x); xSet.add(h.x + h.w);
        ySet.add(h.y); ySet.add(h.y + h.h);
    }
    const xs = [...xSet].sort((a, b) => a - b);
    const ys = [...ySet].sort((a, b) => a - b);
    const nCol = xs.length - 1;
    const nRow = ys.length - 1;

    // ── 2. Precompute solid/void grid ──────────────────────────────────────
    // Out-of-bounds indices are treated as void (the world outside the board).
    const solid: boolean[] = new Array(nRow * nCol).fill(false);
    for (let row = 0; row < nRow; row++) {
        for (let col = 0; col < nCol; col++) {
            const mx = (xs[col] + xs[col + 1]) / 2;
            const my = (ys[row] + ys[row + 1]) / 2;
            const inHole = holes.some(
                h => mx > h.x && mx < h.x + h.w && my > h.y && my < h.y + h.h,
            );
            solid[row * nCol + col] = !inHole;
        }
    }
    function isSolid(col: number, row: number): boolean {
        if (col < 0 || col >= nCol || row < 0 || row >= nRow) return false;
        return solid[row * nCol + col];
    }

    // ── 3. Count triangles (first pass) ───────────────────────────────────
    let totalTris = 0;
    for (let row = 0; row < nRow; row++) {
        for (let col = 0; col < nCol; col++) {
            if (!isSolid(col, row)) continue;
            totalTris += 4; // top + bottom (2 tris each)
            if (!isSolid(col - 1, row)) totalTris += 2; // left wall
            if (!isSolid(col + 1, row)) totalTris += 2; // right wall
            if (!isSolid(col, row - 1)) totalTris += 2; // front wall (-Y side)
            if (!isSolid(col, row + 1)) totalTris += 2; // back wall  (+Y side)
        }
    }

    // ── 4. Allocate buffer ─────────────────────────────────────────────────
    const buf = new ArrayBuffer(80 + 4 + totalTris * 50);
    const dv = new DataView(buf);
    const header = 'Keycap Shadowbox Board';
    for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
    dv.setUint32(80, totalTris, true);
    let off = 84;

    // ── 5. Write triangles (second pass) ──────────────────────────────────
    for (let row = 0; row < nRow; row++) {
        for (let col = 0; col < nCol; col++) {
            if (!isSolid(col, row)) continue;

            const x0 = xs[col], x1 = xs[col + 1];
            const y0 = ys[row], y1 = ys[row + 1];

            // Top face (z=T, normal +Z) — CCW from above
            off = writeTri(dv, off, 0, 0, 1, [x0, y0, T], [x1, y0, T], [x1, y1, T]);
            off = writeTri(dv, off, 0, 0, 1, [x0, y0, T], [x1, y1, T], [x0, y1, T]);

            // Bottom face (z=0, normal -Z) — winding flipped
            off = writeTri(dv, off, 0, 0, -1, [x0, y0, 0], [x1, y1, 0], [x1, y0, 0]);
            off = writeTri(dv, off, 0, 0, -1, [x0, y0, 0], [x0, y1, 0], [x1, y1, 0]);

            // Left wall (x=x0, normal -X): void neighbour to the left
            if (!isSolid(col - 1, row)) {
                off = writeTri(dv, off, -1, 0, 0, [x0, y1, 0], [x0, y0, 0], [x0, y0, T]);
                off = writeTri(dv, off, -1, 0, 0, [x0, y1, 0], [x0, y0, T], [x0, y1, T]);
            }

            // Right wall (x=x1, normal +X): void neighbour to the right
            if (!isSolid(col + 1, row)) {
                off = writeTri(dv, off, 1, 0, 0, [x1, y0, 0], [x1, y1, 0], [x1, y1, T]);
                off = writeTri(dv, off, 1, 0, 0, [x1, y0, 0], [x1, y1, T], [x1, y0, T]);
            }

            // Front wall (y=y0, normal -Y): void neighbour above (smaller y)
            if (!isSolid(col, row - 1)) {
                off = writeTri(dv, off, 0, -1, 0, [x0, y0, 0], [x1, y0, 0], [x1, y0, T]);
                off = writeTri(dv, off, 0, -1, 0, [x0, y0, 0], [x1, y0, T], [x0, y0, T]);
            }

            // Back wall (y=y1, normal +Y): void neighbour below (larger y)
            if (!isSolid(col, row + 1)) {
                off = writeTri(dv, off, 0, 1, 0, [x1, y1, 0], [x0, y1, 0], [x0, y1, T]);
                off = writeTri(dv, off, 0, 1, 0, [x1, y1, 0], [x0, y1, T], [x1, y1, T]);
            }
        }
    }

    // ── 6. Download ────────────────────────────────────────────────────────
    const blob = new Blob([buf], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'keycap-shadowbox.stl';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
