import { useState, useCallback } from 'react';
import type { ClickMode, BoardConfig } from './types/board';
import { DEFAULT_CONFIG, boardCols, boardRows } from './types/board';
import { BoardControls } from './components/BoardControls';
import { ModeSelector } from './components/ModeSelector';
import { Grid } from './components/Grid';
import { exportStl } from './lib/exportStl';
import './App.css';

function App() {
    const [config, setConfig] = useState<BoardConfig>(DEFAULT_CONFIG);
    const [clickMode, setClickMode] = useState<ClickMode>('normal');

    // All holes in one set. Keys are either "n:r,c" (normal) or "h:i,j" (intersection).
    const [enabledCells, setEnabledCells] = useState<ReadonlySet<string>>(new Set());

    const handleConfigChange = useCallback((newConfig: BoardConfig) => {
        setConfig(newConfig);
        setEnabledCells(new Set()); // clear holes when grid dimensions change
    }, []);

    // Single-key toggle or two-key pair toggle (spacebar)
    const handleToggle = useCallback((key: string, key2?: string) => {
        setEnabledCells(prev => {
            const next = new Set(prev);
            if (key2 !== undefined) {
                // Pair: if both present remove both, otherwise add both
                if (next.has(key) && next.has(key2)) {
                    next.delete(key);
                    next.delete(key2);
                } else {
                    next.add(key);
                    next.add(key2);
                }
            } else {
                if (next.has(key)) next.delete(key); else next.add(key);
            }
            return next;
        });
    }, []);

    const handleExportSTL = useCallback(() => {
        exportStl(config, enabledCells);
    }, [config, enabledCells]);

    return (
        <div className="app">
            <header className="app-header">
                <h1>Keycap Shadowboard Generator</h1>
            </header>

            <main className="app-main">
                <aside className="app-sidebar">
                    <BoardControls config={config} onChange={handleConfigChange} />
                    <ModeSelector mode={clickMode} onChange={setClickMode} />

                    <div className="export-section">
                        <p className="section-heading">Export</p>
                        <p className="grid-stat">
                            Grid: <span>{boardCols(config)}&times;{boardRows(config)}</span>
                        </p>
                        <p className="grid-stat">
                            Holes: <span>{enabledCells.size}</span>
                        </p>
                        <button
                            className="export-btn"
                            onClick={handleExportSTL}
                            disabled={enabledCells.size === 0}
                        >
                            Export STL
                        </button>
                    </div>
                </aside>

                <section className="grid-section">
                    <div>
                        <Grid
                            config={config}
                            clickMode={clickMode}
                            enabledCells={enabledCells}
                            onToggle={handleToggle}
                        />
                        <div className="legend">
                            <div className="legend-item">
                                <span className="legend-swatch" style={{ background: '#3b82f6' }} />
                                Normal hole
                            </div>
                            <div className="legend-item">
                                <span className="legend-swatch" style={{ background: '#f59e0b' }} />
                                Half-offset hole
                            </div>
                            <div className="legend-item">
                                <span className="legend-swatch" style={{ background: '#ef4444', opacity: 0.8 }} />
                                Will remove on click
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;
