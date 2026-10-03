import type { BoardConfig } from '../types/board';
import { boardCols, boardRows } from '../types/board';

interface Props {
  config: BoardConfig;
  onChange: (config: BoardConfig) => void;
}

export function BoardControls({ config, onChange }: Props) {
  function set(field: keyof BoardConfig, value: number) {
    onChange({ ...config, [field]: value });
  }

  const cols = boardCols(config);
  const rows = boardRows(config);
  const effectiveWidth = cols * config.cellSize;
  const effectiveHeight = rows * config.cellSize;
  const widthMismatch = effectiveWidth !== config.boardWidth;
  const heightMismatch = effectiveHeight !== config.boardHeight;

  return (
    <div className="board-controls">
      <p className="section-heading">Board Settings</p>

      <label className="control-label">
        Width (mm)
        <input
          type="number"
          className="control-input"
          min={14}
          max={2000}
          value={config.boardWidth}
          onChange={e => set('boardWidth', Number(e.target.value))}
        />
      </label>

      <label className="control-label">
        Height (mm)
        <input
          type="number"
          className="control-input"
          min={14}
          max={2000}
          value={config.boardHeight}
          onChange={e => set('boardHeight', Number(e.target.value))}
        />
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
          onChange={e => set('thickness', Number(e.target.value))}
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
          onChange={e => set('cellSize', Number(e.target.value))}
        />
      </label>

      {(widthMismatch || heightMismatch) && (
        <p className="warning-box">
          Grid snapped to {effectiveWidth}&times;{effectiveHeight}&nbsp;mm
          ({cols}&times;{rows} cells)
        </p>
      )}
    </div>
  );
}
