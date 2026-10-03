import type { ClickMode } from '../types/board';

interface ModeInfo {
    value: ClickMode;
    label: string;
    description: string;
    dotClass: string;
    activeClass: string;
}

const MODES: ModeInfo[] = [
    {
        value: 'normal',
        label: 'Normal',
        description: 'Click a cell to toggle a standard keycap hole.',
        dotClass: 'mode-dot-normal',
        activeClass: 'active',
    },
    {
        value: 'half',
        label: 'Half Offset',
        description:
            'Click near a left/right edge → left/right split (2 cells). Near top/bottom edge → top/bottom split (2 cells). Direction flips dynamically as you move.',
        dotClass: 'mode-dot-half',
        activeClass: 'active-half',
    },
    {
        value: 'spacebar',
        label: 'Spacebar',
        description:
            'Click near a left/right cell edge → horizontal half-offset pair 3 apart. Near top/bottom edge → vertical half-offset pair 3 apart. Center click → normal horizontal pair. Click again to remove.',
        dotClass: 'mode-dot-spacebar',
        activeClass: 'active-spacebar',
    },
];

interface Props {
    mode: ClickMode;
    onChange: (mode: ClickMode) => void;
}

export function ModeSelector({ mode, onChange }: Props) {
    const active = MODES.find(m => m.value === mode);
    return (
        <div className="mode-selector">
            <p className="section-heading">Click Mode</p>
            {MODES.map(m => (
                <button
                    key={m.value}
                    className={`mode-btn ${mode === m.value ? m.activeClass : ''}`}
                    onClick={() => onChange(m.value)}
                >
                    <span className={`mode-dot ${m.dotClass}`} />
                    {m.label}
                </button>
            ))}
            {active && <p className="mode-description">{active.description}</p>}
        </div>
    );
}
