const MODES = [
    ["event", "Event Mode"],
    ["slots", "Slot Mode"],
    ["overview", "Overview Mode"],
    ["code", "Code View"],
];

export default function ModeSwitcher({ activeMode, setActiveMode }) {
    return (
        <div className="mode-button-group-floating">
            {MODES.map(([mode, label]) => (
                <button
                    key={mode}
                    type="button"
                    className={`mode-button ${activeMode === mode ? "active" : ""}`}
                    onClick={() => setActiveMode(mode)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
