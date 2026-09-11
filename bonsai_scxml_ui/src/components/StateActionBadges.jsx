import { getConfiguredAssignments } from "../utils/stateActions";

function StateActionBadges({ onEntry, onExit }) {
    const entryCount = getConfiguredAssignments(onEntry).length;
    const exitCount = getConfiguredAssignments(onExit).length;

    if (entryCount === 0 && exitCount === 0) return null;

    return (
        <div className="state-action-badges" aria-label="Configured state actions">
            {entryCount > 0 && (
                <span
                    className="state-action-badge state-action-badge-entry"
                    title={`${entryCount} onentry assignment${entryCount === 1 ? "" : "s"}`}
                >
                    onentry
                </span>
            )}
            {exitCount > 0 && (
                <span
                    className="state-action-badge state-action-badge-exit"
                    title={`${exitCount} onexit assignment${exitCount === 1 ? "" : "s"}`}
                >
                    onexit
                </span>
            )}
        </div>
    );
}

export default StateActionBadges;
