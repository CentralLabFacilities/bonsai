import { useEffect, useRef, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";

function StateActionsEditor({
                                actionName,
                                actions,
                                availableLocations,
                                onChange,
                                listId,
                            }) {
    const assignments = Array.isArray(actions) ? actions : [];
    const [pendingFocusIndex, setPendingFocusIndex] = useState(null);
    const locationInputRefs = useRef([]);

    const normalizedActionName = String(actionName || "").toLowerCase();
    const isEntry = normalizedActionName === "onentry";
    const displayName = isEntry ? "OnEntry" : "OnExit";

    useEffect(() => {
        if (pendingFocusIndex === null) {
            return;
        }

        const input = locationInputRefs.current[pendingFocusIndex];

        if (input) {
            input.focus();
            input.select();
            setPendingFocusIndex(null);
        }
    }, [assignments.length, pendingFocusIndex]);

    const updateAssignment = (index, changes) => {
        onChange(
            assignments.map((assignment, i) =>
                i === index
                    ? { ...assignment, ...changes }
                    : assignment
            )
        );
    };

    const removeAssignment = (index) => {
        onChange(assignments.filter((_, i) => i !== index));
    };

    const addAssignment = () => {
        const newIndex = assignments.length;

        setPendingFocusIndex(newIndex);

        onChange([
            ...assignments,
            {
                location: "",
                expr: "",
            },
        ]);
    };

    const handleCommitKeyDown = (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        event.currentTarget.blur();
    };

    return (
        <section
            className={`state-action-editor ${
                isEntry
                    ? "state-action-editor-entry"
                    : "state-action-editor-exit"
            }`}
        >
            <div className="state-action-editor-header">
                <div className="state-action-title-group">
                    <div className="state-action-title-row">
                        <h3>{displayName}</h3>

                        <span
                            className={`state-action-kind-badge ${
                                isEntry
                                    ? "state-action-kind-entry"
                                    : "state-action-kind-exit"
                            }`}
                        >
                            {isEntry ? "Enter" : "Exit"}
                        </span>
                    </div>

                    <p>
                        {isEntry
                            ? "Assignments applied when this state is entered."
                            : "Assignments applied when this state is exited."}
                    </p>
                </div>

                <button
                    type="button"
                    className="state-action-add-button"
                    onClick={addAssignment}
                >
                    <FiPlus />
                    Assign
                </button>
            </div>

            {assignments.length === 0 ? (
                <div className="state-action-empty">
                    No {displayName} assignments.
                </div>
            ) : (
                <div className="state-action-list">
                    {assignments.map((assignment, index) => (
                        <div
                            className="state-action-row"
                            key={index}
                        >
                            <div className="state-action-row-number">
                                {index + 1}
                            </div>

                            <div className="state-action-compact-fields">
                                <label className="state-action-compact-field">
                                    <span>Location</span>

                                    <input
                                        ref={(element) => {
                                            locationInputRefs.current[index] =
                                                element;
                                        }}
                                        className="slot-field-edit"
                                        type="text"
                                        list={listId}
                                        value={
                                            assignment.location || ""
                                        }
                                        placeholder="counter"
                                        onChange={(event) =>
                                            updateAssignment(index, {
                                                location:
                                                event.target.value,
                                            })
                                        }
                                        onKeyDown={
                                            handleCommitKeyDown
                                        }
                                    />
                                </label>

                                <div className="state-action-arrow">
                                    →
                                </div>

                                <label className="state-action-compact-field">
                                    <span>Expression</span>

                                    <input
                                        className="slot-field-edit"
                                        type="text"
                                        value={assignment.expr || ""}
                                        placeholder="counter + 1"
                                        onChange={(event) =>
                                            updateAssignment(index, {
                                                expr:
                                                event.target.value,
                                            })
                                        }
                                        onKeyDown={
                                            handleCommitKeyDown
                                        }
                                    />
                                </label>
                            </div>

                            <button
                                type="button"
                                className="state-action-remove-button"
                                title={`Remove ${displayName} assignment`}
                                aria-label={`Remove ${displayName} assignment ${index + 1}`}
                                onClick={() =>
                                    removeAssignment(index)
                                }
                            >
                                <FiTrash2 />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <datalist id={listId}>
                {availableLocations.map((location) => (
                    <option
                        value={location}
                        key={location}
                    />
                ))}
            </datalist>
        </section>
    );
}

export default StateActionsEditor;
