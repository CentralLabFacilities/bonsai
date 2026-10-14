import { SegmentedButton, SegmentedControl } from "../ui/index.js";

const MODES = [
    ["event", "Event Mode"],
    ["slots", "Slot Mode"],
    ["overview", "Overview Mode"],
    ["code", "Code View"],
];

export default function ModeSwitcher({ activeMode, setActiveMode, showCodeViewButton = true }) {
    return (
        <SegmentedControl className="mode-button-group-floating" aria-label="Editor mode">
            {MODES.filter(([mode]) => mode !== "code" || showCodeViewButton).map(([mode, label]) => (
                <SegmentedButton
                    key={mode}
                    className="mode-button"
                    active={activeMode === mode}
                    onClick={() => setActiveMode(mode)}
                >
                    {label}
                </SegmentedButton>
            ))}
        </SegmentedControl>
    );
}
