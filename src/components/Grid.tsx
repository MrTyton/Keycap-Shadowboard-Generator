import { useRef, useCallback, useState, useMemo } from 'react';
import type { BoardConfig, ClickMode } from '../types/board';
import { boardCols, boardRows, normalCellKey, halfLRKey, halfTBKey, halfCornerKey } from '../types/board';

const PX_PER_MM = 3;

// ── Pure helpers (no component state) ─────────────────────────────────────────

/** SVG top-left corner of the rect drawn for a given key */
function keyToPos(key: string, cpx: number): { x: number; y: number } {
    const colon = key.indexOf(':');
    const parts = key.slice(colon + 1).split(',');
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (key.startsWith('n:')) {
        // Normal: rect fills cell (a=row, b=col)
        return { x: b * cpx, y: a * cpx };
    }
    if (key.startsWith('hlr:')) {
        // Half left-right: centred on vertical line b (=j), at row a (=r)
        // x shifts left by half so the rect straddles the vertical boundary
        return { x: b * cpx - cpx / 2, y: a * cpx };
    }
    if (key.startsWith('htb:')) {
        // Half top-bottom: centred on horizontal line a (=i), at col b (=c)
        return { x: b * cpx, y: a * cpx - cpx / 2 };
    }
    // hc: Corner intersection — centred at the actual grid corner point (a=i, b=j)
    return { x: b * cpx - cpx / 2, y: a * cpx - cpx / 2 };
}

function keyColor(key: string): string {
    return key.startsWith('n:') ? '#3b82f6' : '#f59e0b';
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
    config: BoardConfig;
    clickMode: ClickMode;
    enabledCells: ReadonlySet<string>;
    onToggle: (key: string, key2?: string) => void;
}

export function Grid({ config, clickMode, enabledCells, onToggle }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    // Raw SVG-space mouse coordinates, updated on every mousemove
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

    const cols = boardCols(config);
    const rows = boardRows(config);
    const cpx = config.cellSize * PX_PER_MM;
    const W = cols * cpx;
    const H = rows * cpx;

    /** Convert a mouse event to SVG coordinate space */
    const toSVG = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const svg = svgRef.current;
            if (!svg) return null;
            const rect = svg.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (W / rect.width),
                y: (e.clientY - rect.top) * (H / rect.height),
            };
        },
        [W, H],
    );

    /**
     * From an SVG point, compute what hole(s) would be toggled.
     *
     * Normal mode   → the cell the point lands in
     * Half mode     → a hole that straddles EXACTLY two cells:
     *                   - if the point is closer to a vertical cell edge  → left/right split (hlr)
     *                   - if the point is closer to a horizontal cell edge → top/bottom split (htb)
     * Spacebar mode → two holes 3 units apart (horizontal):
     *                   - near left/right edge (dx < 25 %) → half-LR pair
     *                   - otherwise                         → normal pair
     */
    const computeTarget = useCallback(
        (x: number, y: number): { key: string; key2?: string } | null => {
            const c = Math.floor(x / cpx);
            const r = Math.floor(y / cpx);
            if (c < 0 || c >= cols || r < 0 || r >= rows) return null;

            if (clickMode === 'normal') {
                return { key: normalCellKey(r, c) };
            }

            // Offset within the cell (0 → cpx)
            const dx = x - c * cpx;
            const dy = y - r * cpx;

            // Distance to nearest vertical vs horizontal cell edge
            const distV = Math.min(dx, cpx - dx);   // distance to nearest left/right edge
            const distH = Math.min(dy, cpx - dy);   // distance to nearest top/bottom edge

            if (clickMode === 'half') {
                const j = dx < cpx / 2 ? c : c + 1;
                const i = dy < cpx / 2 ? r : r + 1;
                // Within 25 % of BOTH a vertical and horizontal edge → corner intersection
                if (distV <= cpx * 0.25 && distH <= cpx * 0.25) {
                    if (i < 1 || i > rows - 1 || j < 1 || j > cols - 1) return null;
                    return { key: halfCornerKey(i, j) };
                }
                if (distV <= distH) {
                    // Left-right split: hole centred on the vertical boundary
                    if (j < 1 || j > cols - 1) return null;
                    return { key: halfLRKey(r, j) };
                } else {
                    // Top-bottom split: hole centred on the horizontal boundary
                    if (i < 1 || i > rows - 1) return null;
                    return { key: halfTBKey(i, c) };
                }
            }

            // Spacebar mode — near any edge → half pair in that direction;
            // center click → normal horizontal pair.
            const nearLR = dx < cpx * 0.25 || dx > cpx * 0.75;
            const nearTB = dy < cpx * 0.25 || dy > cpx * 0.75;

            if (nearLR || nearTB) {
                const j = dx < cpx / 2 ? c : c + 1;
                const i = dy < cpx / 2 ? r : r + 1;
                // Near BOTH edges → corner-intersection pair (3 columns to the right)
                if (nearLR && nearTB) {
                    if (i < 1 || i > rows - 1 || j < 1 || j > cols - 1) return null;
                    const j2 = j + 3;
                    if (j2 > cols - 1) return null;
                    return { key: halfCornerKey(i, j), key2: halfCornerKey(i, j2) };
                }
                if (distV <= distH) {
                    // Half left-right spacebar pair
                    if (j < 1 || j > cols - 1) return null;
                    const j2 = j + 3;
                    if (j2 > cols - 1) return null;
                    return { key: halfLRKey(r, j), key2: halfLRKey(r, j2) };
                } else {
                    // Half top-bottom spacebar pair: second hole 3 columns to the right
                    if (i < 1 || i > rows - 1) return null;
                    const c2 = c + 3;
                    if (c2 >= cols) return null;
                    return { key: halfTBKey(i, c), key2: halfTBKey(i, c2) };
                }
            } else {
                // Center → normal horizontal pair
                const c2 = c + 3;
                if (c2 >= cols) return null;
                return { key: normalCellKey(r, c), key2: normalCellKey(r, c2) };
            }
        },
        [clickMode, cols, rows, cpx],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => { setMouse(toSVG(e)); },
        [toSVG],
    );
    const handleMouseLeave = useCallback(() => setMouse(null), []);

    const handleClick = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const pos = toSVG(e);
            if (!pos) return;
            const t = computeTarget(pos.x, pos.y);
            if (!t) return;
            onToggle(t.key, t.key2);
        },
        [toSVG, computeTarget, onToggle],
    );

    // ── Static grid lines ────────────────────────────────────────────────────────
    const gridLines = useMemo(() => {
        const lines: React.ReactElement[] = [];
        for (let c = 0; c <= cols; c++) {
            lines.push(
                <line key={`v${c}`} x1={c * cpx} y1={0} x2={c * cpx} y2={H}
                    stroke="#334155" strokeWidth={0.5} />,
            );
        }
        for (let r = 0; r <= rows; r++) {
            lines.push(
                <line key={`h${r}`} x1={0} y1={r * cpx} x2={W} y2={r * cpx}
                    stroke="#334155" strokeWidth={0.5} />,
            );
        }
        return lines;
    }, [cols, rows, cpx, W, H]);

    // ── Enabled hole rects ───────────────────────────────────────────────────────
    const enabledRects = useMemo(() =>
        Array.from(enabledCells).map(key => {
            const { x, y } = keyToPos(key, cpx);
            return (
                <rect key={key} x={x + 1} y={y + 1} width={cpx - 2} height={cpx - 2}
                    fill={keyColor(key)} rx={2} />
            );
        }),
        [enabledCells, cpx],
    );

    // ── Hover layer (directional highlight + hole preview) ───────────────────────
    const hoverLayer = useMemo(() => {
        if (!mouse) return null;
        const { x, y } = mouse;
        const c = Math.floor(x / cpx);
        const r = Math.floor(y / cpx);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return null;

        const dx = x - c * cpx;
        const dy = y - r * cpx;
        const distV = Math.min(dx, cpx - dx);
        const distH = Math.min(dy, cpx - dy);
        const elements: React.ReactElement[] = [];

        // ── Directional half-highlight ───────────────────────────────────────────
        if (clickMode === 'half') {
            if (distV <= cpx * 0.25 && distH <= cpx * 0.25) {
                // Near corner: highlight the corner quarter
                const qx = c * cpx + (dx < cpx / 2 ? 0 : cpx / 2);
                const qy = r * cpx + (dy < cpx / 2 ? 0 : cpx / 2);
                elements.push(
                    <rect key="hl" x={qx} y={qy} width={cpx / 2} height={cpx / 2}
                        fill="#f59e0b" opacity={0.22} style={{ pointerEvents: 'none' }} />,
                );
            } else if (distV <= distH) {
                // LR split: highlight the left or right half of the hovered cell
                const hx = c * cpx + (dx < cpx / 2 ? 0 : cpx / 2);
                elements.push(
                    <rect key="hl" x={hx} y={r * cpx} width={cpx / 2} height={cpx}
                        fill="#f59e0b" opacity={0.15} style={{ pointerEvents: 'none' }} />,
                );
            } else {
                // TB split: highlight the top or bottom half of the hovered cell
                const hy = r * cpx + (dy < cpx / 2 ? 0 : cpx / 2);
                elements.push(
                    <rect key="hl" x={c * cpx} y={hy} width={cpx} height={cpx / 2}
                        fill="#f59e0b" opacity={0.15} style={{ pointerEvents: 'none' }} />,
                );
            }
        } else if (clickMode === 'spacebar') {
            const nearLR = dx < cpx * 0.25 || dx > cpx * 0.75;
            const nearTB = dy < cpx * 0.25 || dy > cpx * 0.75;
            if (nearLR || nearTB) {
                if (nearLR && nearTB) {
                    // Corner highlight
                    const qx = c * cpx + (dx < cpx / 2 ? 0 : cpx / 2);
                    const qy = r * cpx + (dy < cpx / 2 ? 0 : cpx / 2);
                    elements.push(
                        <rect key="hl" x={qx} y={qy} width={cpx / 2} height={cpx / 2}
                            fill="#f59e0b" opacity={0.2} style={{ pointerEvents: 'none' }} />,
                    );
                } else if (distV <= distH) {
                    // LR highlight
                    const hx = c * cpx + (dx < cpx / 2 ? 0 : cpx / 2);
                    elements.push(
                        <rect key="hl" x={hx} y={r * cpx} width={cpx / 2} height={cpx}
                            fill="#f59e0b" opacity={0.12} style={{ pointerEvents: 'none' }} />,
                    );
                } else {
                    // TB highlight
                    const hy = r * cpx + (dy < cpx / 2 ? 0 : cpx / 2);
                    elements.push(
                        <rect key="hl" x={c * cpx} y={hy} width={cpx} height={cpx / 2}
                            fill="#f59e0b" opacity={0.12} style={{ pointerEvents: 'none' }} />,
                    );
                }
            }
        }

        // ── Hole preview ─────────────────────────────────────────────────────────
        let previewKeys: string[] = [];

        if (clickMode === 'normal') {
            previewKeys = [normalCellKey(r, c)];
        } else if (clickMode === 'half') {
            const j = dx < cpx / 2 ? c : c + 1;
            const i = dy < cpx / 2 ? r : r + 1;
            if (distV <= cpx * 0.25 && distH <= cpx * 0.25) {
                if (i >= 1 && i <= rows - 1 && j >= 1 && j <= cols - 1) previewKeys = [halfCornerKey(i, j)];
            } else if (distV <= distH) {
                if (j >= 1 && j <= cols - 1) previewKeys = [halfLRKey(r, j)];
            } else {
                if (i >= 1 && i <= rows - 1) previewKeys = [halfTBKey(i, c)];
            }
        } else {
            // spacebar
            const nearLR = dx < cpx * 0.25 || dx > cpx * 0.75;
            const nearTB = dy < cpx * 0.25 || dy > cpx * 0.75;
            if (nearLR || nearTB) {
                const j = dx < cpx / 2 ? c : c + 1;
                const i = dy < cpx / 2 ? r : r + 1;
                if (nearLR && nearTB) {
                    // Corner spacebar preview
                    if (i >= 1 && i <= rows - 1 && j >= 1 && j <= cols - 1) {
                        const j2 = j + 3;
                        if (j2 <= cols - 1) previewKeys = [halfCornerKey(i, j), halfCornerKey(i, j2)];
                    }
                } else if (distV <= distH) {
                    if (j >= 1 && j <= cols - 1) {
                        const j2 = j + 3;
                        if (j2 <= cols - 1) previewKeys = [halfLRKey(r, j), halfLRKey(r, j2)];
                    }
                } else {
                    if (i >= 1 && i <= rows - 1) {
                        const c2 = c + 3;
                        if (c2 < cols) previewKeys = [halfTBKey(i, c), halfTBKey(i, c2)];
                    }
                }
            } else {
                const c2 = c + 3;
                if (c2 < cols) previewKeys = [normalCellKey(r, c), normalCellKey(r, c2)];
            }
        }

        for (const key of previewKeys) {
            const { x: rx, y: ry } = keyToPos(key, cpx);
            const fill = enabledCells.has(key) ? '#ef4444' : keyColor(key);
            elements.push(
                <rect key={`prev-${key}`}
                    x={rx + 1} y={ry + 1} width={cpx - 2} height={cpx - 2}
                    fill={fill} opacity={0.55} rx={2}
                    style={{ pointerEvents: 'none' }} />,
            );
        }

        return elements;
    }, [mouse, cpx, cols, rows, clickMode, enabledCells]);

    // ── Edge midpoint guide dots (half mode only) ────────────────────────────────
    // Vertical edge midpoints (for LR holes): one per (row, col-boundary) pair
    // Horizontal edge midpoints (for TB holes): one per (row-boundary, col) pair
    const intersectionDots = useMemo(() => {
        if (clickMode !== 'half') return null;
        const dots: React.ReactElement[] = [];
        // LR midpoints — on vertical grid lines
        for (let r = 0; r < rows; r++) {
            for (let j = 1; j < cols; j++) {
                if (enabledCells.has(halfLRKey(r, j))) continue;
                dots.push(
                    <circle key={`lr-${r}-${j}`}
                        cx={j * cpx} cy={(r + 0.5) * cpx} r={1.5}
                        fill="#f59e0b" opacity={0.35} />,
                );
            }
        }
        // TB midpoints — on horizontal grid lines
        for (let i = 1; i < rows; i++) {
            for (let c = 0; c < cols; c++) {
                if (enabledCells.has(halfTBKey(i, c))) continue;
                dots.push(
                    <circle key={`tb-${i}-${c}`}
                        cx={(c + 0.5) * cpx} cy={i * cpx} r={1.5}
                        fill="#f59e0b" opacity={0.35} />,
                );
            }
        }
        return dots;
    }, [clickMode, rows, cols, cpx, enabledCells]);

    // ── Corner intersection dots (half mode) ──────────────────────────────────────
    const cornerDots = useMemo(() => {
        if (clickMode !== 'half') return null;
        const dots: React.ReactElement[] = [];
        for (let i = 1; i < rows; i++) {
            for (let j = 1; j < cols; j++) {
                if (enabledCells.has(halfCornerKey(i, j))) continue;
                dots.push(
                    <circle key={`hc-${i}-${j}`}
                        cx={j * cpx} cy={i * cpx} r={2}
                        fill="#f59e0b" opacity={0.5} />,
                );
            }
        }
        return dots;
    }, [clickMode, rows, cols, cpx, enabledCells]);

    return (
        <div className="grid-wrapper">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="grid-svg"
                onClick={handleClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'crosshair', width: Math.min(W, 900), height: 'auto' }}
            >
                <rect width={W} height={H} fill="#111827" />
                {gridLines}
                {intersectionDots}
                {cornerDots}
                {enabledRects}
                {hoverLayer}
            </svg>
        </div>
    );
}

