import { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { normalizeAssignmentExpressionInput, validateAssignmentExpression } from "../utils/assignmentExpressions";
import ExpressionVariableSuggestions from "./ExpressionVariableSuggestions.jsx";
import {
    getExpressionAutocompleteAction,
    getMatchingExpressionVariables,
    insertExpressionVariable,
} from "./expressionAutocomplete.js";

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
    const [expressionDrafts, setExpressionDrafts] = useState([]);
    const [expressionErrors, setExpressionErrors] = useState({});
    const [openExpressionIndex, setOpenExpressionIndex] = useState(null);
    const [expressionCaretPosition, setExpressionCaretPosition] = useState(0);
    const [activeExpressionSuggestionIndex, setActiveExpressionSuggestionIndex] = useState(-1);
    const locationInputRefs = useRef([]);
    const expressionInputRefs = useRef([]);

    const committedExpressionSignature = assignments
        .map((assignment) => String(assignment?.expr || ""))
        .join("\u0001");

    useEffect(() => {
        // Synchronize external commits without discarding drafts on location-only edits.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpressionDrafts(
            assignments.map((assignment) => String(assignment?.expr || ""))
        );
        setExpressionErrors({});
        // The signature and count, not assignment identity, define a committed-expression reset.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignments.length, committedExpressionSignature]);

    const locationOptions = useMemo(
        () =>
            (Array.isArray(availableLocations) ? availableLocations : [])
                .map((location) =>
                    typeof location === "string"
                        ? { id: location, type: null, source: "Data" }
                        : location
                )
                .filter(
                    (location) =>
                        location?.id &&
                        String(location.id).trim() !== "#_STATE_PREFIX"
                ),
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
        setExpressionDrafts((current) => current.filter((_, i) => i !== index));
        setExpressionErrors((current) => {
            const next = {};
            Object.entries(current).forEach(([key, value]) => {
                const numericKey = Number(key);
                if (numericKey < index) next[numericKey] = value;
                if (numericKey > index) next[numericKey - 1] = value;
            });
            return next;
        });
        setOpenLocationIndex((current) => {
            if (current === index) return null;
            if (current !== null && current > index) return current - 1;
            return current;
        });
        setActiveLocationSuggestionIndex(-1);
        setOpenExpressionIndex((current) => {
            if (current === index) return null;
            if (current !== null && current > index) return current - 1;
            return current;
        });
        setActiveExpressionSuggestionIndex(-1);
    };

    const addAssignment = () => {
        const newIndex = assignments.length;

        setPendingFocusIndex(newIndex);
        setExpressionDrafts((current) => [...current, ""]);

        onChange([
            ...assignments,
            {
                location: "",
                expr: "",
            },
        ]);
    };

    const validateExpression = (
        index,
        expression,
        targetLocation,
        allowEmpty = true,
        showError = false
    ) => {
        const result = validateAssignmentExpression(
            expression,
            targetLocation,
            valueVariables,
            { allowEmpty }
        );

        setExpressionErrors((current) => ({
            ...current,
            [index]: showError && !result.valid ? result.error : "",
        }));

        return result;
    };

    const updateLocation = (index, nextLocation) => {
        updateAssignment(index, { location: nextLocation });
        setExpressionErrors((current) => ({
            ...current,
            [index]: "",
        }));
    };

    const updateExpressionDraft = (index, value) => {
        setExpressionDrafts((current) => {
            const next = [...current];
            next[index] = value;
            return next;
        });

        // Do not show validation errors while the user is still typing.
        // Pressing Enter explicitly validates the current expression.
        setExpressionErrors((current) => ({
            ...current,
            [index]: "",
        }));
    };

    const commitExpression = (index, targetLocation, showError = false) => {
        const draft = expressionDrafts[index] ?? assignments[index]?.expr ?? "";
        const normalizedDraft = normalizeAssignmentExpressionInput(
            draft,
            targetLocation,
            valueVariables
        );

        if (normalizedDraft !== draft) {
            setExpressionDrafts((current) => {
                const next = [...current];
                next[index] = normalizedDraft;
                return next;
            });
        }

        const result = validateExpression(
            index,
            normalizedDraft,
            targetLocation,
            false,
            showError
        );

        if (!result.valid) return false;

        updateAssignment(index, { expr: result.value });
        return true;
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

    const updateExpressionAutocomplete = (index, value, caretPosition) => {
        const { context, matches } = getMatchingExpressionVariables(
            value,
            caretPosition,
            valueVariables,
            { excludeStatePrefix: true }
        );

        setExpressionCaretPosition(caretPosition);

        if (!context || matches.length === 0) {
            setOpenExpressionIndex(null);
            setActiveExpressionSuggestionIndex(-1);
            return;
        }

        setOpenExpressionIndex(index);
        setActiveExpressionSuggestionIndex(0);
    };

    const selectExpressionSuggestion = (index, variable) => {
        if (!variable?.id) return;

        const value =
            expressionDrafts[index] ??
            assignments[index]?.expr ??
            "";
        const insertion = insertExpressionVariable(
            value,
            expressionCaretPosition,
            variable.id
        );

        if (!insertion) return;

        updateExpressionDraft(index, insertion.value);
        setOpenExpressionIndex(null);
        setActiveExpressionSuggestionIndex(-1);

        requestAnimationFrame(() => {
            const input = expressionInputRefs.current[index];
            input?.focus();
            input?.setSelectionRange?.(insertion.caretPosition, insertion.caretPosition);
            setExpressionCaretPosition(insertion.caretPosition);
        });
    };

    const handleExpressionKeyDown = (
        event,
        index,
        matchingVariables,
        targetLocation
    ) => {
        const autocompleteOpen =
            openExpressionIndex === index &&
            matchingVariables.length > 0;

        const action = getExpressionAutocompleteAction(
            event.key,
            autocompleteOpen,
            matchingVariables.length,
            activeExpressionSuggestionIndex
        );

        if (action) {
            event.preventDefault();
            if (action.type === "navigate") {
                const key = event.key;
                setActiveExpressionSuggestionIndex((current) =>
                    getExpressionAutocompleteAction(key, true, matchingVariables.length, current).index
                );
            } else if (action.type === "select") {
                selectExpressionSuggestion(index, matchingVariables[action.index]);
            } else {
                setOpenExpressionIndex(null);
                setActiveExpressionSuggestionIndex(-1);
            }
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();

            const valid = commitExpression(
                index,
                targetLocation,
                true
            );

            if (valid) {
                setOpenExpressionIndex(null);
                setActiveExpressionSuggestionIndex(-1);
                event.currentTarget.blur();
            }
        }
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
                        const expressionValue =
                            expressionDrafts[index] ??
                            assignment.expr ??
                            "";
                        const matchingExpressionVariables =
                            openExpressionIndex === index
                                ? getMatchingExpressionVariables(
                                    expressionValue,
                                    expressionCaretPosition,
                                    valueVariables,
                                    { excludeStatePrefix: true }
                                ).matches
                                : [];
                        const isExpressionAutocompleteOpen =
                            openExpressionIndex === index &&
                            matchingExpressionVariables.length > 0;

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
                                            <span>Variable</span>
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
                                                placeholder="Select variable"
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

                                        <div className="typed-value-editor-row">
                                            <input
                                                ref={(element) => {
                                                    expressionInputRefs.current[index] =
                                                        element;
                                                }}
                                                className="slot-field-edit"
                                                type="text"
                                                value={expressionValue}
                                                disabled={!targetLocation}
                                                placeholder={
                                                    targetLocation
                                                        ? "Value, e.g. @test_value + 1"
                                                        : "Select variable first"
                                                }
                                                autoComplete="off"
                                                spellCheck={false}
                                                onFocus={(event) =>
                                                    updateExpressionAutocomplete(
                                                        index,
                                                        event.currentTarget.value,
                                                        event.currentTarget.selectionStart ??
                                                        event.currentTarget.value.length
                                                    )
                                                }
                                                onClick={(event) =>
                                                    updateExpressionAutocomplete(
                                                        index,
                                                        event.currentTarget.value,
                                                        event.currentTarget.selectionStart ??
                                                        event.currentTarget.value.length
                                                    )
                                                }
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    const caretPosition =
                                                        event.target.selectionStart ??
                                                        value.length;
                                                    updateExpressionDraft(
                                                        index,
                                                        value
                                                    );
                                                    updateExpressionAutocomplete(
                                                        index,
                                                        value,
                                                        caretPosition
                                                    );
                                                }}
                                                onBlur={() => {
                                                    window.setTimeout(() => {
                                                        setOpenExpressionIndex(
                                                            (current) =>
                                                                current === index
                                                                    ? null
                                                                    : current
                                                        );
                                                        setActiveExpressionSuggestionIndex(
                                                            -1
                                                        );
                                                    }, 120);
                                                    commitExpression(
                                                        index,
                                                        targetLocation,
                                                        false
                                                    );
                                                }}
                                                onKeyDown={(event) =>
                                                    handleExpressionKeyDown(
                                                        event,
                                                        index,
                                                        matchingExpressionVariables,
                                                        targetLocation
                                                    )
                                                }
                                            />

                                            {isExpressionAutocompleteOpen && (
                                                <ExpressionVariableSuggestions
                                                    variables={matchingExpressionVariables}
                                                    activeIndex={activeExpressionSuggestionIndex}
                                                    onSelect={(variable) => selectExpressionSuggestion(index, variable)}
                                                />
                                            )}
                                        </div>

                                        {expressionErrors[index] && (
                                            <div
                                                style={{
                                                    color: "#ef4444",
                                                    fontSize: "12px",
                                                    marginTop: "5px",
                                                    lineHeight: 1.35,
                                                }}
                                            >
                                                {expressionErrors[index]}
                                            </div>
                                        )}
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
