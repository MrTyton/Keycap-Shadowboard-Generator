import type { BoardConfig } from '../types/board';
import { boardCols, boardRows } from '../types/board';

interface Props {
    config: BoardConfig;
    onChange: (config: BoardConfig) => void;
}

export function BoardControls({ config, onChange }: Props) {
    const cols = boardCols(config);
    const rows = boardRows(config);

    function setCols(newCols: number) {
        onChange({ ...config, boardWidth: newCols * config.cellSize });
    }
    function setRows(newRows: number) {
        onChange({ ...config, boardHeight: newRows * config.cellSize });
    }
    function setCellSize(newCellSize: number) {
        // Keep column/row count the same; derived mm dimensions update automatically.
        onChange({
            ...config,
            cellSize: newCellSize,
            boardWidth: cols * newCellSize,
            boardHeight: rows * newCellSize,
        });
    }
    function setThickness(value: number) {
        onChange({ ...config, thickness: value });
    }

    return (
        <div className="board-controls">
            <p className="section-heading">Board Settings</p>

            <label className="control-label">
                Columns
                <span className="control-row">
                    <input
                        type="number"
                        className="control-input"
                        min={1}
                        max={200}
                        value={cols}
                        onChange={e => setCols(Math.max(1, Math.round(Number(e.target.value))))}
                    />
                    <span className="control-derived">= {config.boardWidth}&thinsp;mm</span>
                </span>
            </label>

            <label className="control-label">
                Rows
                <span className="control-row">
                    <input
                        type="number"
                        className="control-input"
                        min={1}
                        max={200}
                        value={rows}
                        onChange={e => setRows(Math.max(1, Math.round(Number(e.target.value))))}
                    />
                    <span className="control-derived">= {config.boardHeight}&thinsp;mm</span>
                </span>
            </label>

            <label className="control-label">
                Thickness (mm)
                <input
                    type="number"
                    className="control-input"
                    min={1}
                    max={50}
                    step={0.5}
                    value={config.thickness}
                    onChange={e => setThickness(Number(e.target.value))}
                />
            </label>

            <label className="control-label">
                Cell Size (mm)
                <input
                    type="number"
                    className="control-input"
                    min={5}
                    max={100}
                    step={0.5}
                    value={config.cellSize}
                    onChange={e => setCellSize(Number(e.target.value))}
                />
            </label>
        </div>
    );
}
