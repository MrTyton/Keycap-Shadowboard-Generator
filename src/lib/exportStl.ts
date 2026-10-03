import earcut from 'earcut';
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

/**
 * Write a planar quad as two triangles (a, b, c) + (a, c, d).
 * Vertices must be in CCW order when viewed from the outward-normal side.
 */
function writeQuad(
    dv: DataView,
    off: number,
    nx: number, ny: number, nz: number,
    a: Vec3, b: Vec3, c: Vec3, d: Vec3,
): number {
    off = writeTri(dv, off, nx, ny, nz, a, b, c);
    off = writeTri(dv, off, nx, ny, nz, a, c, d);
    return off;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function exportStl(config: BoardConfig, enabledCells: ReadonlySet<string>): void {
    const { boardWidth: W, boardHeight: H, thickness: T, cellSize } = config;
    const holes = keysToHoles(enabledCells, cellSize);
    const n = holes.length;

    // ── 1. Triangulate top / bottom faces using earcut ────────────────────────
    //
    // Outer boundary: CCW from +Z (X right, Y "up" in the 2-D plane)
    //   (0,0) → (W,0) → (W,H) → (0,H)
    //
    // Each hole boundary: CW from +Z (opposite winding = valid earcut hole)
    //   (hx,hy) → (hx,hy+hh) → (hx+hw,hy+hh) → (hx+hw,hy)

    const verts2D: number[] = [0, 0, W, 0, W, H, 0, H];
    const holeStarts: number[] = [];

    for (const h of holes) {
        holeStarts.push(verts2D.length / 2);
        verts2D.push(
            h.x, h.y,
            h.x, h.y + h.h,
            h.x + h.w, h.y + h.h,
            h.x + h.w, h.y,
        );
    }

    const faceIdx = earcut(verts2D, holeStarts.length > 0 ? holeStarts : undefined);
    const faceTris = faceIdx.length / 3; // number of triangles in each flat face

    // ── 2. Count total triangles ──────────────────────────────────────────────
    //   outer walls      : 4 quads = 8 tris
    //   hole inner walls : 4 quads per hole = 8n tris
    //   top face         : faceTris
    //   bottom face      : faceTris
    const totalTris = 8 + 8 * n + 2 * faceTris;

    // ── 3. Allocate buffer ────────────────────────────────────────────────────
    const buf = new ArrayBuffer(80 + 4 + totalTris * 50);
    const dv = new DataView(buf);

    // Header (80 bytes)
    const header = 'Keycap Shadowbox Board';
    for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
    dv.setUint32(80, totalTris, true);

    let off = 84;

    // ── 4. Outer side walls ───────────────────────────────────────────────────
    // Convention: CCW winding when viewed from outside (outward normal).
    // Cross-product check used to verify each quad below.

    // Front wall  (y=0, normal -Y)
    off = writeQuad(dv, off, 0, -1, 0,
        [0, 0, 0], [W, 0, 0], [W, 0, T], [0, 0, T]);

    // Back wall   (y=H, normal +Y)
    off = writeQuad(dv, off, 0, 1, 0,
        [W, H, 0], [0, H, 0], [0, H, T], [W, H, T]);

    // Left wall   (x=0, normal -X)
    off = writeQuad(dv, off, -1, 0, 0,
        [0, H, 0], [0, 0, 0], [0, 0, T], [0, H, T]);

    // Right wall  (x=W, normal +X)
    off = writeQuad(dv, off, 1, 0, 0,
        [W, 0, 0], [W, H, 0], [W, H, T], [W, 0, T]);

    // ── 5. Hole inner walls ───────────────────────────────────────────────────
    // For each hole, the outward normal of the solid points INTO the hole void.
    for (const h of holes) {
        const { x: hx, y: hy, w: hw, h: hh } = h;
        const x2 = hx + hw;
        const y2 = hy + hh;

        // Hole left wall   (x=hx,  normal +X — void is to the right)
        off = writeQuad(dv, off, 1, 0, 0,
            [hx, hy, 0], [hx, y2, 0], [hx, y2, T], [hx, hy, T]);

        // Hole right wall  (x=x2,  normal -X — void is to the left)
        off = writeQuad(dv, off, -1, 0, 0,
            [x2, y2, 0], [x2, hy, 0], [x2, hy, T], [x2, y2, T]);

        // Hole front wall  (y=hy,  normal +Y — void is behind)
        off = writeQuad(dv, off, 0, 1, 0,
            [x2, hy, 0], [hx, hy, 0], [hx, hy, T], [x2, hy, T]);

        // Hole back wall   (y=y2,  normal -Y — void is in front)
        off = writeQuad(dv, off, 0, -1, 0,
            [hx, y2, 0], [x2, y2, 0], [x2, y2, T], [hx, y2, T]);
    }

    // ── 6. Top face  (z=T, normal +Z) ────────────────────────────────────────
    // earcut gives CCW triangles (same winding as our outer boundary) → normal +Z
    for (let t = 0; t < faceTris; t++) {
        const ia = faceIdx[t * 3] * 2;
        const ib = faceIdx[t * 3 + 1] * 2;
        const ic = faceIdx[t * 3 + 2] * 2;
        off = writeTri(dv, off, 0, 0, 1,
            [verts2D[ia], verts2D[ia + 1], T],
            [verts2D[ib], verts2D[ib + 1], T],
            [verts2D[ic], verts2D[ic + 1], T],
        );
    }

    // ── 7. Bottom face (z=0, normal -Z) ──────────────────────────────────────
    // Flip winding (swap b and c) so normal points downward (-Z).
    for (let t = 0; t < faceTris; t++) {
        const ia = faceIdx[t * 3] * 2;
        const ib = faceIdx[t * 3 + 1] * 2;
        const ic = faceIdx[t * 3 + 2] * 2;
        off = writeTri(dv, off, 0, 0, -1,
            [verts2D[ia], verts2D[ia + 1], 0],
            [verts2D[ic], verts2D[ic + 1], 0],
            [verts2D[ib], verts2D[ib + 1], 0],
        );
    }

    // ── 8. Trigger browser download ───────────────────────────────────────────
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
