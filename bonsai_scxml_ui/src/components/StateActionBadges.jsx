import { getConfiguredAssignments } from "../utils/stateActions";

function StateActionBadges({
                               onEntry,
                               onExit,
                               onEntryClick,
                               onExitClick,
                           }) {
    const entryCount = getConfiguredAssignments(onEntry).length;
    const exitCount = getConfiguredAssignments(onExit).length;

    if (entryCount === 0 && exitCount === 0) return null;

    const handleBadgeClick = (event, callback) => {
        event.preventDefault();
        event.stopPropagation();
        callback?.();
    };

    return (
        <div
            className="state-action-badges"
            aria-label="Configured state actions"
        >
            {entryCount > 0 && (
                <button
                    type="button"
                    className="state-action-badge state-action-badge-entry"
                    title={`${entryCount} onentry assignment${entryCount === 1 ? "" : "s"} — open Entry / Exit`}
                    onClick={(event) =>
                        handleBadgeClick(event, onEntryClick)
                    }
                >
                    onentry
                </button>
            )}

            {exitCount > 0 && (
                <button
                    type="button"
                    className="state-action-badge state-action-badge-exit"
                    title={`${exitCount} onexit assignment${exitCount === 1 ? "" : "s"} — open Entry / Exit`}
                    onClick={(event) =>
                        handleBadgeClick(event, onExitClick)
                    }
                >
                    onexit
                </button>
            )}
        </div>
    );
}

export default StateActionBadges;
