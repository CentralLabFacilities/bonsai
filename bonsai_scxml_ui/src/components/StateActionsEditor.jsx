import { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import TypedValueEditor from "./TypedValueEditor";
import { normalizeTypedValue } from "../utils/valueTypes";

function StateActionsEditor({
                                actionName,
                                actions,
                                availableLocations,
                                valueVariables = [],
                                onChange,
                            }) {
    const assignments = Array.isArray(actions) ? actions : [];
    const [pendingFocusIndex, setPendingFocusIndex] = useState(null);
    const [openLocationIndex, setOpenLocationIndex] = useState(null);
    const [activeLocationSuggestionIndex, setActiveLocationSuggestionIndex] = useState(-1);
    const locationInputRefs = useRef([]);

    const locationOptions = useMemo(
        () =>
            (Array.isArray(availableLocations) ? availableLocations : [])
                .map((location) =>
                    typeof location === "string"
                        ? { id: location, type: null, source: "Datamodel" }
                        : location
                )
                .filter((location) => location?.id),
        [availableLocations]
    );

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
            setOpenLocationIndex(pendingFocusIndex);
            setActiveLocationSuggestionIndex(locationOptions.length > 0 ? 0 : -1);
            setPendingFocusIndex(null);
        }
    }, [assignments.length, locationOptions.length, pendingFocusIndex]);

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
        setOpenLocationIndex((current) => {
            if (current === index) return null;
            if (current !== null && current > index) return current - 1;
            return current;
        });
        setActiveLocationSuggestionIndex(-1);
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

    const updateLocation = (index, nextLocation) => {
        const target = locationOptions.find(
            (location) => location.id === nextLocation
        );
        const currentExpression = assignments[index]?.expr || "";
        const changes = { location: nextLocation };

        if (target && currentExpression.trim()) {
            const normalized = normalizeTypedValue(
                currentExpression,
                target.type,
                valueVariables,
                { allowEmpty: true }
            );

            changes.expr = normalized.valid ? normalized.value : "";
        }

        updateAssignment(index, changes);
    };

    const getMatchingLocationOptions = (query) => {
        const normalizedQuery = String(query || "").trim().toLowerCase();

        if (!normalizedQuery) {
            return locationOptions;
        }

        return locationOptions
            .filter((location) =>
                String(location.id || "")
                    .toLowerCase()
                    .includes(normalizedQuery)
            )
            .sort((a, b) => {
                const aId = String(a.id || "").toLowerCase();
                const bId = String(b.id || "").toLowerCase();
                const aStarts = aId.startsWith(normalizedQuery) ? 0 : 1;
                const bStarts = bId.startsWith(normalizedQuery) ? 0 : 1;

                return aStarts - bStarts || aId.localeCompare(bId);
            })
            .slice(0, 8);
    };

    const selectLocationSuggestion = (index, location) => {
        if (!location) return;

        updateLocation(index, location.id);
        setOpenLocationIndex(null);
        setActiveLocationSuggestionIndex(-1);

        requestAnimationFrame(() => {
            locationInputRefs.current[index]?.focus();
        });
    };

    const handleLocationKeyDown = (event, index, matchingLocations) => {
        if (event.key === "ArrowDown" && matchingLocations.length > 0) {
            event.preventDefault();
            setOpenLocationIndex(index);
            setActiveLocationSuggestionIndex((current) =>
                current < matchingLocations.length - 1 ? current + 1 : 0
            );
            return;
        }

        if (event.key === "ArrowUp" && matchingLocations.length > 0) {
            event.preventDefault();
            setOpenLocationIndex(index);
            setActiveLocationSuggestionIndex((current) =>
                current > 0 ? current - 1 : matchingLocations.length - 1
            );
            return;
        }

        if (event.key === "Escape") {
            setOpenLocationIndex(null);
            setActiveLocationSuggestionIndex(-1);
            return;
        }

        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        if (matchingLocations.length > 0) {
            const suggestionIndex =
                activeLocationSuggestionIndex >= 0 &&
                activeLocationSuggestionIndex < matchingLocations.length
                    ? activeLocationSuggestionIndex
                    : 0;

            selectLocationSuggestion(
                index,
                matchingLocations[suggestionIndex]
            );
            return;
        }

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
                    {assignments.map((assignment, index) => {
                        const targetLocation = locationOptions.find(
                            (location) => location.id === assignment.location
                        );
                        const matchingLocations = getMatchingLocationOptions(
                            assignment.location
                        );
                        const isLocationAutocompleteOpen =
                            openLocationIndex === index &&
                            matchingLocations.length > 0;

                        return (
                            <div
                                className="state-action-row"
                                key={index}
                            >
                                <div className="state-action-row-number">
                                    {index + 1}
                                </div>

                                <div className="state-action-compact-fields">
                                    <label className="state-action-compact-field">
                                        <span className="state-action-field-label-row">
                                            <span>Location</span>
                                            {targetLocation?.type && (
                                                <span className={`datamodel-value-type-badge datamodel-value-type-${targetLocation.type.toLowerCase()}`}>
                                                    {targetLocation.type}
                                                </span>
                                            )}
                                        </span>

                                        <div className="typed-value-editor-row">
                                            <input
                                                ref={(element) => {
                                                    locationInputRefs.current[index] =
                                                        element;
                                                }}
                                                className="slot-field-edit"
                                                type="text"
                                                value={
                                                    assignment.location || ""
                                                }
                                                placeholder="Select target"
                                                autoComplete="off"
                                                onFocus={() => {
                                                    const matches =
                                                        getMatchingLocationOptions(
                                                            assignment.location
                                                        );
                                                    setOpenLocationIndex(index);
                                                    setActiveLocationSuggestionIndex(
                                                        matches.length > 0 ? 0 : -1
                                                    );
                                                }}
                                                onChange={(event) => {
                                                    const nextLocation =
                                                        event.target.value;
                                                    updateLocation(
                                                        index,
                                                        nextLocation
                                                    );
                                                    const matches =
                                                        getMatchingLocationOptions(
                                                            nextLocation
                                                        );
                                                    setOpenLocationIndex(index);
                                                    setActiveLocationSuggestionIndex(
                                                        matches.length > 0 ? 0 : -1
                                                    );
                                                }}
                                                onBlur={() => {
                                                    window.setTimeout(() => {
                                                        setOpenLocationIndex(
                                                            (current) =>
                                                                current === index
                                                                    ? null
                                                                    : current
                                                        );
                                                        setActiveLocationSuggestionIndex(-1);
                                                    }, 120);
                                                }}
                                                onKeyDown={(event) =>
                                                    handleLocationKeyDown(
                                                        event,
                                                        index,
                                                        matchingLocations
                                                    )
                                                }
                                            />

                                            {isLocationAutocompleteOpen && (
                                                <div
                                                    className="typed-value-autocomplete"
                                                    role="listbox"
                                                >
                                                    {matchingLocations.map(
                                                        (location, suggestionIndex) => (
                                                            <button
                                                                type="button"
                                                                className={`typed-value-autocomplete-option ${
                                                                    suggestionIndex ===
                                                                    activeLocationSuggestionIndex
                                                                        ? "active"
                                                                        : ""
                                                                }`}
                                                                key={location.id}
                                                                onMouseDown={(event) => {
                                                                    event.preventDefault();
                                                                    selectLocationSuggestion(
                                                                        index,
                                                                        location
                                                                    );
                                                                }}
                                                            >
                                                                <span className="typed-value-autocomplete-value">
                                                                    {location.id}
                                                                </span>
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </label>

                                    <div className="state-action-arrow">
                                        →
                                    </div>

                                    <div className="state-action-compact-field">
                                        <span>Value</span>

                                        <TypedValueEditor
                                            value={assignment.expr || ""}
                                            expectedType={targetLocation?.type}
                                            variables={valueVariables}
                                            disabled={!targetLocation}
                                            placeholder={
                                                targetLocation?.type
                                                    ? `${targetLocation.type} value`
                                                    : "Select target first"
                                            }
                                            onCommit={(value) =>
                                                updateAssignment(index, {
                                                    expr: value,
                                                })
                                            }
                                        />
                                    </div>
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
                        );
                    })}
                </div>
            )}
        </section>
    );
}

export default StateActionsEditor;
