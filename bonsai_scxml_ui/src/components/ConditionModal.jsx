import { useEffect, useMemo, useRef, useState } from "react";
import {
    FiArrowRight,
    FiCheck,
    FiChevronDown,
    FiChevronUp,
    FiPlus,
    FiTrash2,
    FiX,
    FiAlertTriangle,
} from "react-icons/fi";
import TypedValueEditor from "./TypedValueEditor";
import {
    VALUE_TYPES,
    getVariableType,
    normalizeDatamodelValue,
    normalizeTypedValue,
} from "../utils/valueTypes";

const CONDITION_PATTERN = /^([^\s]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

function createTransitionId(prefix = "transition") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createAssignmentId(prefix = "assignment") {
    return createTransitionId(prefix);
}

function getTransitionAssignments(transition, variables) {
    const fallbackLocation = variables[0]?.id || "";
    const rawAssignments = Array.isArray(transition.assignments)
        ? transition.assignments
        : transition.assignLocation
            ? [
                {
                    location: transition.assignLocation,
                    expr: transition.assignExpr || "",
                },
            ]
            : [];

    return rawAssignments.map((assignment, index) => ({
        assignmentId:
            assignment.assignmentId ||
            assignment.id ||
            createAssignmentId(`existing-assignment-${index}`),
        location: assignment.location || fallbackLocation,
        expr: assignment.expr || "",
    }));
}

function parseCondition(condition) {
    const text = String(condition || "").trim();
    if (!text) return null;

    const match = text.match(CONDITION_PATTERN);
    if (!match) {
        return {
            variable: "",
            operator: "==",
            value: text,
        };
    }

    return {
        variable: match[1],
        operator: match[2],
        value: match[3],
    };
}

function hydrateTransition(transition, index, variables, fallbackEvent = "") {
    const parsedCondition = parseCondition(transition.cond);
    const conditionVariable = parsedCondition?.variable || variables[0]?.id || "";
    const conditionVariableExists = variables.some(
        (variable) => variable.id === conditionVariable
    );

    return {
        transitionId:
            transition.transitionId ||
            transition.edgeId ||
            createTransitionId(`existing-${index}`),
        edgeId: transition.edgeId || null,
        event:
            transition.event ||
            transition.eventId ||
            transition.sourceHandle ||
            fallbackEvent ||
            "",
        target: transition.target || "",
        targetLabel: transition.targetLabel || transition.target || "",

        conditionEnabled: Boolean(parsedCondition),
        conditionVariable,
        conditionOperator: parsedCondition?.operator || "==",
        conditionValue: parsedCondition?.value || "",
        conditionVariableIsNew:
            Boolean(parsedCondition?.variable) && !conditionVariableExists,
        conditionVariableInitialValue: "",

        assignments: getTransitionAssignments(transition, variables),
    };
}

function getTargetDisplayName(targetId, availableTargets) {
    if (!targetId) return "";

    const target = availableTargets.find((option) => option.id === targetId);
    return target?.displayName || target?.label || targetId;
}

function ConditionModal({
                            isOpen,
                            onClose,
                            onConfirm,
                            globalVariables = [],
                            sourceEventName = "",
                            sourceNodeName,
                            candidateTransitions = [],
                            availableEvents = [],
                            availableTargets = [],
                            initialTransitionId = null,
                            initialTargetId = null,
                        }) {
    const drawerRef = useRef(null);

    const usableVars = useMemo(
        () => (globalVariables || []).filter((variable) => !String(variable.id || "").startsWith("#")),
        [globalVariables]
    );

    const normalizedEvents = useMemo(() => {
        const seen = new Set();
        const result = [];

        (availableEvents || []).forEach((event) => {
            const eventId = typeof event === "string" ? event : event?.id;
            if (!eventId || seen.has(eventId)) return;
            seen.add(eventId);
            result.push({
                id: eventId,
                description: typeof event === "string" ? "" : event?.description || "",
            });
        });

        if (sourceEventName && !seen.has(sourceEventName)) {
            result.push({ id: sourceEventName, description: "" });
        }

        return result;
    }, [availableEvents, sourceEventName]);

    const [transitionsState, setTransitionsState] = useState([]);
    const [selectedTransitionId, setSelectedTransitionId] = useState("");
    const [newTransitionEvent, setNewTransitionEvent] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const [targetQuery, setTargetQuery] = useState("");
    const [targetAutocompleteOpen, setTargetAutocompleteOpen] = useState(false);
    const [activeTargetSuggestionIndex, setActiveTargetSuggestionIndex] = useState(-1);

    useEffect(() => {
        if (!isOpen) return;

        const hydrated = candidateTransitions.map((transition, index) =>
            hydrateTransition(transition, index, usableVars, sourceEventName)
        );

        setTransitionsState(hydrated);
        setErrorMessage("");

        let selectedId = initialTransitionId;

        if (!selectedId && initialTargetId) {
            selectedId = hydrated.find(
                (transition) =>
                    transition.target === initialTargetId &&
                    (!sourceEventName || transition.event === sourceEventName)
            )?.transitionId;
        }

        if (!selectedId || !hydrated.some((transition) => transition.transitionId === selectedId)) {
            selectedId = hydrated[0]?.transitionId || "";
        }

        setSelectedTransitionId(selectedId || "");
        setNewTransitionEvent(
            sourceEventName || normalizedEvents[0]?.id || ""
        );
    }, [
        isOpen,
        candidateTransitions,
        usableVars,
        sourceEventName,
        normalizedEvents,
        initialTransitionId,
        initialTargetId,
    ]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handleOutsideClick = (event) => {
            if (drawerRef.current && !drawerRef.current.contains(event.target)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isOpen, onClose]);

    const selectedTransition = transitionsState.find(
        (transition) => transition.transitionId === selectedTransitionId
    );

    const customVariables = useMemo(() => {
        const seen = new Set(usableVars.map((variable) => variable.id));
        const result = [];

        transitionsState.forEach((transition) => {
            if (!transition.conditionVariableIsNew) return;

            const id = String(transition.conditionVariable || "").trim();
            if (!id || seen.has(id)) return;

            seen.add(id);
            result.push({
                id,
                expr: transition.conditionVariableInitialValue || "",
            });
        });

        return result;
    }, [transitionsState, usableVars]);

    const editorVariables = useMemo(
        () => [...usableVars, ...customVariables],
        [usableVars, customVariables]
    );

    const selectedConditionVariable = selectedTransition
        ? editorVariables.find(
            (variable) => variable.id === selectedTransition.conditionVariable
        ) ||
        (selectedTransition.conditionVariable
            ? {
                id: selectedTransition.conditionVariable,
                expr: selectedTransition.conditionVariableInitialValue || "",
            }
            : null)
        : null;

    const conditionVariableType = getVariableType(selectedConditionVariable);
    const conditionIsBoolean = conditionVariableType === VALUE_TYPES.BOOLEAN;

    useEffect(() => {
        if (!selectedTransition) {
            setTargetQuery("");
            return;
        }

        setTargetQuery(
            getTargetDisplayName(selectedTransition.target, availableTargets)
        );
        setTargetAutocompleteOpen(false);
        setActiveTargetSuggestionIndex(-1);
    }, [selectedTransitionId, selectedTransition?.target, availableTargets]);

    useEffect(() => {
        if (!selectedTransition || !conditionIsBoolean) return;
        if (
            selectedTransition.conditionOperator !== "==" &&
            selectedTransition.conditionOperator !== "!="
        ) {
            setTransitionsState((current) =>
                current.map((transition) =>
                    transition.transitionId === selectedTransitionId
                        ? { ...transition, conditionOperator: "==" }
                        : transition
                )
            );
        }
    }, [
        conditionIsBoolean,
        selectedTransition,
        selectedTransitionId,
    ]);

    const matchingTargets = useMemo(() => {
        const query = String(targetQuery || "").trim().toLowerCase();
        if (!query) return [];

        return (availableTargets || [])
            .filter((target) =>
                [
                    target.displayName,
                    target.label,
                    target.fullSkillName,
                    target.packageName,
                    target.id,
                ].some((value) =>
                    String(value || "").toLowerCase().includes(query)
                )
            )
            .sort((a, b) => {
                const aName = String(a.displayName || a.label || a.id).toLowerCase();
                const bName = String(b.displayName || b.label || b.id).toLowerCase();
                const aStarts = aName.startsWith(query) ? 0 : 1;
                const bStarts = bName.startsWith(query) ? 0 : 1;
                return aStarts - bStarts || aName.localeCompare(bName);
            })
            .slice(0, 8);
    }, [targetQuery, availableTargets]);

    useEffect(() => {
        if (activeTargetSuggestionIndex >= matchingTargets.length) {
            setActiveTargetSuggestionIndex(matchingTargets.length > 0 ? 0 : -1);
        }
    }, [matchingTargets, activeTargetSuggestionIndex]);

    if (!isOpen) return null;

    const updateSelectedTransition = (changes) => {
        if (!selectedTransitionId) return;

        setTransitionsState((current) =>
            current.map((transition) =>
                transition.transitionId === selectedTransitionId
                    ? { ...transition, ...changes }
                    : transition
            )
        );
        setErrorMessage("");
    };

    const handleAddAssignment = () => {
        if (!selectedTransitionId || editorVariables.length === 0) return;

        const assignment = {
            assignmentId: createAssignmentId("new-assignment"),
            location: editorVariables[0]?.id || "",
            expr: "",
        };

        setTransitionsState((current) =>
            current.map((transition) =>
                transition.transitionId === selectedTransitionId
                    ? {
                        ...transition,
                        assignments: [
                            ...(Array.isArray(transition.assignments)
                                ? transition.assignments
                                : []),
                            assignment,
                        ],
                    }
                    : transition
            )
        );
        setErrorMessage("");
    };

    const updateAssignment = (assignmentId, changes) => {
        if (!selectedTransitionId) return;

        setTransitionsState((current) =>
            current.map((transition) =>
                transition.transitionId === selectedTransitionId
                    ? {
                        ...transition,
                        assignments: (transition.assignments || []).map(
                            (assignment) =>
                                assignment.assignmentId === assignmentId
                                    ? { ...assignment, ...changes }
                                    : assignment
                        ),
                    }
                    : transition
            )
        );
        setErrorMessage("");
    };

    const deleteAssignment = (assignmentId) => {
        if (!selectedTransitionId) return;

        setTransitionsState((current) =>
            current.map((transition) =>
                transition.transitionId === selectedTransitionId
                    ? {
                        ...transition,
                        assignments: (transition.assignments || []).filter(
                            (assignment) =>
                                assignment.assignmentId !== assignmentId
                        ),
                    }
                    : transition
            )
        );
        setErrorMessage("");
    };

    const handleMove = (index, direction, event) => {
        event.stopPropagation();

        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= transitionsState.length) return;

        setTransitionsState((current) => {
            const copy = [...current];
            [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
            return copy;
        });
    };

    const handleAddTransition = () => {
        const eventId = newTransitionEvent || normalizedEvents[0]?.id || "";
        if (!eventId) {
            setErrorMessage("No possible event is available for a new transition.");
            return;
        }

        const transitionId = createTransitionId("new");
        const newTransition = {
            transitionId,
            edgeId: null,
            event: eventId,
            target: "",
            targetLabel: "",
            conditionEnabled: false,
            conditionVariable: usableVars[0]?.id || "",
            conditionOperator: "==",
            conditionValue: "",
            conditionVariableIsNew: false,
            conditionVariableInitialValue: "",
            assignments: [],
        };

        setTransitionsState((current) => [...current, newTransition]);
        setSelectedTransitionId(transitionId);
        setTargetQuery("");
        setErrorMessage("");
    };

    const handleDeleteTransition = (transitionId, event) => {
        event.stopPropagation();

        setTransitionsState((current) => {
            const index = current.findIndex(
                (transition) => transition.transitionId === transitionId
            );
            const next = current.filter(
                (transition) => transition.transitionId !== transitionId
            );

            if (selectedTransitionId === transitionId) {
                const replacement = next[Math.min(index, next.length - 1)];
                setSelectedTransitionId(replacement?.transitionId || "");
            }

            return next;
        });
    };

    const selectTarget = (target) => {
        if (!target) return;

        updateSelectedTransition({
            target: target.id,
            targetLabel: target.displayName || target.label || target.id,
        });
        setTargetQuery(target.displayName || target.label || target.id);
        setTargetAutocompleteOpen(false);
        setActiveTargetSuggestionIndex(-1);
    };

    const handleTargetKeyDown = (event) => {
        if (
            targetAutocompleteOpen &&
            matchingTargets.length > 0 &&
            event.key === "ArrowDown"
        ) {
            event.preventDefault();
            setActiveTargetSuggestionIndex((current) =>
                current < matchingTargets.length - 1 ? current + 1 : 0
            );
            return;
        }

        if (
            targetAutocompleteOpen &&
            matchingTargets.length > 0 &&
            event.key === "ArrowUp"
        ) {
            event.preventDefault();
            setActiveTargetSuggestionIndex((current) =>
                current > 0 ? current - 1 : matchingTargets.length - 1
            );
            return;
        }

        if (event.key === "Escape") {
            setTargetAutocompleteOpen(false);
            setActiveTargetSuggestionIndex(-1);
            return;
        }

        if (event.key !== "Enter") return;
        event.preventDefault();

        if (
            targetAutocompleteOpen &&
            matchingTargets.length > 0 &&
            activeTargetSuggestionIndex >= 0
        ) {
            selectTarget(matchingTargets[activeTargetSuggestionIndex]);
        }
    };

    const handleSave = () => {
        setErrorMessage("");

        const newVariablesById = new Map();
        const allVariables = [...usableVars];

        for (const transition of transitionsState) {
            if (!transition.conditionEnabled || !transition.conditionVariableIsNew) {
                continue;
            }

            const variableId = String(transition.conditionVariable || "").trim();
            const initialValue = String(
                transition.conditionVariableInitialValue || ""
            ).trim();

            if (!variableId || !initialValue) {
                setSelectedTransitionId(transition.transitionId);
                setErrorMessage(
                    "A new condition variable needs both an ID and an initial value."
                );
                return;
            }

            if (!newVariablesById.has(variableId)) {
                const variable = {
                    id: variableId,
                    expr: normalizeDatamodelValue(initialValue),
                };
                newVariablesById.set(variableId, variable);
                allVariables.push(variable);
            }
        }

        const normalizedTransitions = [];

        for (let index = 0; index < transitionsState.length; index += 1) {
            const transition = transitionsState[index];

            if (!transition.event) {
                setSelectedTransitionId(transition.transitionId);
                setErrorMessage(`Transition #${index + 1} needs an event.`);
                return;
            }

            if (!transition.target) {
                setSelectedTransitionId(transition.transitionId);
                setErrorMessage(
                    `Transition #${index + 1} needs a target in step 4.`
                );
                return;
            }

            let condition = "";

            if (transition.conditionEnabled) {
                const variableName = String(
                    transition.conditionVariable || ""
                ).trim();
                const variable = allVariables.find(
                    (candidate) => candidate.id === variableName
                );

                if (!variableName || !variable) {
                    setSelectedTransitionId(transition.transitionId);
                    setErrorMessage(
                        `Transition #${index + 1} needs a valid condition variable.`
                    );
                    return;
                }

                const variableType = getVariableType(variable);
                const conditionValue = normalizeTypedValue(
                    transition.conditionValue,
                    variableType,
                    allVariables,
                    { allowEmpty: false }
                );

                if (!conditionValue.valid) {
                    setSelectedTransitionId(transition.transitionId);
                    setErrorMessage(
                        conditionValue.error ||
                        `Transition #${index + 1} has an invalid condition value.`
                    );
                    return;
                }

                const operator =
                    variableType === VALUE_TYPES.BOOLEAN &&
                    transition.conditionOperator !== "==" &&
                    transition.conditionOperator !== "!="
                        ? "=="
                        : transition.conditionOperator;

                condition = `${variableName} ${operator} ${conditionValue.value}`;
            }

            const assignments = [];

            for (let assignmentIndex = 0; assignmentIndex < (transition.assignments || []).length; assignmentIndex += 1) {
                const assignment = transition.assignments[assignmentIndex];
                const assignLocation = String(assignment.location || "").trim();
                const assignmentVariable = allVariables.find(
                    (variable) => variable.id === assignLocation
                );

                if (!assignLocation || !assignmentVariable) {
                    setSelectedTransitionId(transition.transitionId);
                    setErrorMessage(
                        `Transition #${index + 1}, assignment #${assignmentIndex + 1} needs a valid variable.`
                    );
                    return;
                }

                const assignmentResult = normalizeTypedValue(
                    assignment.expr,
                    getVariableType(assignmentVariable),
                    allVariables,
                    { allowEmpty: false }
                );

                if (!assignmentResult.valid) {
                    setSelectedTransitionId(transition.transitionId);
                    setErrorMessage(
                        assignmentResult.error ||
                        `Transition #${index + 1}, assignment #${assignmentIndex + 1} has an invalid value.`
                    );
                    return;
                }

                assignments.push({
                    assignmentId: assignment.assignmentId,
                    location: assignLocation,
                    expr: assignmentResult.value,
                });
            }

            const firstAssignment = assignments[0] || null;

            normalizedTransitions.push({
                transitionId: transition.transitionId,
                edgeId: transition.edgeId,
                event: transition.event,
                target: transition.target,
                targetLabel:
                    transition.targetLabel ||
                    getTargetDisplayName(transition.target, availableTargets),
                cond: condition,
                assignments,
                // Legacy fields stay populated for older code paths.
                assignLocation: firstAssignment?.location || "",
                assignExpr: firstAssignment?.expr || "",
            });
        }

        onConfirm({
            updatedTransitions: normalizedTransitions,
            newGlobalVars: [...newVariablesById.values()],
        });
    };

    const selectedEventDescription = normalizedEvents.find(
        (event) => event.id === selectedTransition?.event
    )?.description;

    return (
        <div className="bottom-drawer-container">
            <div ref={drawerRef} className="bottom-drawer-content full-width">
                <div className="bottom-drawer-header">
                    <div className="transition-drawer-heading">
                        <span className="transition-drawer-title">
                            Transitions: <span>{sourceNodeName}</span>
                        </span>
                        <span className="transition-drawer-subtitle">
                            Order is evaluated from top to bottom.
                        </span>
                    </div>
                    <button className="modal-close-button" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                {errorMessage && (
                    <div className="drawer-error-box">
                        <FiAlertTriangle style={{ fontSize: "18px", flexShrink: 0 }} />
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div className="bottom-drawer-grid-layout transition-editor-grid">
                    <div className="step-card transition-list-step">
                        <div className="step-card-header">
                            <span className="step-number">1</span>
                            <span className="step-title">Transitions</span>
                        </div>

                        <div className="step-card-body transition-step-body">
                            <div className="transition-order-list">
                                {transitionsState.length > 0 ? (
                                    transitionsState.map((transition, index) => {
                                        const isSelected =
                                            transition.transitionId === selectedTransitionId;
                                        const targetName =
                                            transition.targetLabel ||
                                            getTargetDisplayName(
                                                transition.target,
                                                availableTargets
                                            );

                                        return (
                                            <div
                                                key={transition.transitionId}
                                                className={`transition-order-card ${
                                                    isSelected ? "selected" : ""
                                                }`}
                                                onClick={() =>
                                                    setSelectedTransitionId(
                                                        transition.transitionId
                                                    )
                                                }
                                            >
                                                <div className="transition-order-main">
                                                    <div className="transition-order-title-row">
                                                        <span className="transition-priority">
                                                            #{index + 1}
                                                        </span>
                                                        <span className="transition-event-name">
                                                            {transition.event || "No event"}
                                                        </span>
                                                    </div>

                                                    <div className="transition-order-summary">
                                                        <span>
                                                            {transition.conditionEnabled
                                                                ? transition.conditionVariable &&
                                                                transition.conditionValue
                                                                    ? `${transition.conditionVariable} ${transition.conditionOperator} ${transition.conditionValue}`
                                                                    : "Condition configured"
                                                                : "No condition"}
                                                        </span>
                                                        <FiArrowRight />
                                                        <span>
                                                            {targetName || "No target"}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div
                                                    className="transition-order-actions"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <button
                                                        className="order-btn"
                                                        disabled={index === 0}
                                                        onClick={(event) =>
                                                            handleMove(index, -1, event)
                                                        }
                                                        title="Move up"
                                                    >
                                                        <FiChevronUp />
                                                    </button>
                                                    <button
                                                        className="order-btn"
                                                        disabled={
                                                            index ===
                                                            transitionsState.length - 1
                                                        }
                                                        onClick={(event) =>
                                                            handleMove(index, 1, event)
                                                        }
                                                        title="Move down"
                                                    >
                                                        <FiChevronDown />
                                                    </button>
                                                    <button
                                                        className="transition-delete-button"
                                                        onClick={(event) =>
                                                            handleDeleteTransition(
                                                                transition.transitionId,
                                                                event
                                                            )
                                                        }
                                                        title="Delete transition"
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="transition-empty-state">
                                        No transitions yet.
                                    </div>
                                )}
                            </div>

                            <div className="transition-add-row">
                                <select
                                    className="skill-select"
                                    value={newTransitionEvent}
                                    onChange={(event) =>
                                        setNewTransitionEvent(event.target.value)
                                    }
                                >
                                    {normalizedEvents.map((event) => (
                                        <option key={event.id} value={event.id}>
                                            {event.id}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    className="filter-button transition-primary-button transition-add-button"
                                    type="button"
                                    onClick={handleAddTransition}
                                >
                                    <FiPlus /> Add
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">2</span>
                            <span className="step-title">Condition</span>
                        </div>

                        <div className="step-card-body transition-step-body">
                            {selectedTransition ? (
                                <>
                                    <label className="transition-enable-row">
                                        <input
                                            type="checkbox"
                                            checked={selectedTransition.conditionEnabled}
                                            onChange={(event) =>
                                                updateSelectedTransition({
                                                    conditionEnabled:
                                                    event.target.checked,
                                                })
                                            }
                                        />
                                        <span>Add condition</span>
                                    </label>

                                    {selectedTransition.conditionEnabled && (
                                        <>
                                            <div className="transition-variable-mode-row">
                                                {!selectedTransition.conditionVariableIsNew ? (
                                                    <>
                                                        <select
                                                            className="skill-select transition-variable-select"
                                                            value={
                                                                selectedTransition.conditionVariable
                                                            }
                                                            onChange={(event) =>
                                                                updateSelectedTransition({
                                                                    conditionVariable:
                                                                    event.target.value,
                                                                })
                                                            }
                                                        >
                                                            {usableVars.map((variable) => (
                                                                <option
                                                                    key={variable.id}
                                                                    value={variable.id}
                                                                >
                                                                    {variable.id}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            className="transition-secondary-button"
                                                            type="button"
                                                            onClick={() =>
                                                                updateSelectedTransition({
                                                                    conditionVariableIsNew: true,
                                                                    conditionVariable: "",
                                                                    conditionVariableInitialValue:
                                                                        "",
                                                                })
                                                            }
                                                        >
                                                            <FiPlus /> New variable
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        className="transition-secondary-button"
                                                        type="button"
                                                        onClick={() =>
                                                            updateSelectedTransition({
                                                                conditionVariableIsNew: false,
                                                                conditionVariable:
                                                                    usableVars[0]?.id || "",
                                                                conditionVariableInitialValue:
                                                                    "",
                                                            })
                                                        }
                                                    >
                                                        Use existing variable
                                                    </button>
                                                )}
                                            </div>

                                            {selectedTransition.conditionVariableIsNew && (
                                                <div className="transition-new-variable-row">
                                                    <input
                                                        className="slot-field-edit"
                                                        type="text"
                                                        value={
                                                            selectedTransition.conditionVariable
                                                        }
                                                        placeholder="Variable ID"
                                                        onChange={(event) =>
                                                            updateSelectedTransition({
                                                                conditionVariable:
                                                                event.target.value,
                                                            })
                                                        }
                                                    />
                                                    <input
                                                        className="slot-field-edit"
                                                        type="text"
                                                        value={
                                                            selectedTransition.conditionVariableInitialValue
                                                        }
                                                        placeholder="Initial value"
                                                        onChange={(event) =>
                                                            updateSelectedTransition({
                                                                conditionVariableInitialValue:
                                                                event.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}

                                            <div className="condition-expression-row">
                                                {conditionVariableType ? (
                                                    <span
                                                        className={`datamodel-value-type-badge datamodel-value-type-${conditionVariableType.toLowerCase()}`}
                                                    >
                                                        {conditionVariableType}
                                                    </span>
                                                ) : (
                                                    <span className="datamodel-value-type-badge datamodel-value-type-unknown">
                                                        Type
                                                    </span>
                                                )}

                                                <span
                                                    className="condition-expression-variable"
                                                    title={
                                                        selectedTransition.conditionVariable ||
                                                        "Variable"
                                                    }
                                                >
                                                    {selectedTransition.conditionVariable ||
                                                        "Variable"}
                                                </span>

                                                <select
                                                    className="skill-select condition-expression-operator"
                                                    value={
                                                        selectedTransition.conditionOperator
                                                    }
                                                    onChange={(event) =>
                                                        updateSelectedTransition({
                                                            conditionOperator:
                                                            event.target.value,
                                                        })
                                                    }
                                                >
                                                    {!conditionIsBoolean && (
                                                        <option value=">">&gt;</option>
                                                    )}
                                                    {!conditionIsBoolean && (
                                                        <option value="<">&lt;</option>
                                                    )}
                                                    <option value="==">==</option>
                                                    {!conditionIsBoolean && (
                                                        <option value=">=">&gt;=</option>
                                                    )}
                                                    {!conditionIsBoolean && (
                                                        <option value="<=">&lt;=</option>
                                                    )}
                                                    <option value="!=">!=</option>
                                                </select>

                                                <div className="condition-expression-value">
                                                    <TypedValueEditor
                                                        key={`${selectedTransition.transitionId}:${selectedTransition.conditionVariable}`}
                                                        value={
                                                            selectedTransition.conditionValue
                                                        }
                                                        expectedType={
                                                            conditionVariableType
                                                        }
                                                        variables={editorVariables}
                                                        allowEmpty={false}
                                                        placeholder={
                                                            conditionVariableType
                                                                ? `${conditionVariableType} value or @variable`
                                                                : "Value or @variable"
                                                        }
                                                        onDraftChange={(value) =>
                                                            updateSelectedTransition({
                                                                conditionValue: value,
                                                            })
                                                        }
                                                        onCommit={(value) =>
                                                            updateSelectedTransition({
                                                                conditionValue: value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className="transition-empty-state">
                                    Select a transition in step 1.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="step-card">
                        <div className="step-card-header transition-assignment-header">
                            <span className="step-number">3</span>
                            <span className="step-title">Assignments</span>
                            {selectedTransition && editorVariables.length > 0 && (
                                <button
                                    className="transition-secondary-button transition-primary-button transition-add-assignment-button"
                                    type="button"
                                    onClick={handleAddAssignment}
                                >
                                    <FiPlus /> Add
                                </button>
                            )}
                        </div>

                        <div className="step-card-body transition-step-body">
                            {selectedTransition ? (
                                <>
                                    {editorVariables.length === 0 ? (
                                        <div className="transition-help-text">
                                            Create a datamodel variable before adding an assignment.
                                        </div>
                                    ) : (selectedTransition.assignments || []).length === 0 ? (
                                        <div className="transition-empty-state">
                                            No assignments yet. Use + Add to create one.
                                        </div>
                                    ) : (
                                        <div className="transition-assignment-list">
                                            {(selectedTransition.assignments || []).map(
                                                (assignment, assignmentIndex) => {
                                                    const assignmentVariable =
                                                        editorVariables.find(
                                                            (variable) =>
                                                                variable.id === assignment.location
                                                        );
                                                    const assignmentVariableType =
                                                        getVariableType(assignmentVariable);

                                                    return (
                                                        <div
                                                            className="transition-assignment-editor"
                                                            key={assignment.assignmentId}
                                                        >
                                                            <div className="transition-assignment-target-row">
                                                                {assignmentVariableType ? (
                                                                    <span
                                                                        className={`datamodel-value-type-badge datamodel-value-type-${assignmentVariableType.toLowerCase()}`}
                                                                    >
                                                                        {assignmentVariableType}
                                                                    </span>
                                                                ) : (
                                                                    <span className="datamodel-value-type-badge datamodel-value-type-unknown">
                                                                        Type
                                                                    </span>
                                                                )}

                                                                <select
                                                                    className="skill-select transition-assignment-location"
                                                                    value={assignment.location}
                                                                    onChange={(event) =>
                                                                        updateAssignment(
                                                                            assignment.assignmentId,
                                                                            {
                                                                                location:
                                                                                event.target.value,
                                                                                expr: "",
                                                                            }
                                                                        )
                                                                    }
                                                                >
                                                                    {editorVariables.map(
                                                                        (variable) => (
                                                                            <option
                                                                                key={variable.id}
                                                                                value={variable.id}
                                                                            >
                                                                                {variable.id}
                                                                            </option>
                                                                        )
                                                                    )}
                                                                </select>

                                                                <button
                                                                    className="transition-assignment-delete-button"
                                                                    type="button"
                                                                    title={`Delete assignment #${assignmentIndex + 1}`}
                                                                    onClick={() =>
                                                                        deleteAssignment(
                                                                            assignment.assignmentId
                                                                        )
                                                                    }
                                                                >
                                                                    <FiTrash2 />
                                                                </button>
                                                            </div>

                                                            <TypedValueEditor
                                                                key={`${selectedTransition.transitionId}:${assignment.assignmentId}:${assignment.location}`}
                                                                value={assignment.expr}
                                                                expectedType={
                                                                    assignmentVariableType
                                                                }
                                                                variables={editorVariables}
                                                                allowEmpty={false}
                                                                placeholder={
                                                                    assignmentVariableType
                                                                        ? `${assignmentVariableType} value or @variable`
                                                                        : "Value or @variable"
                                                                }
                                                                onDraftChange={(value) =>
                                                                    updateAssignment(
                                                                        assignment.assignmentId,
                                                                        { expr: value }
                                                                    )
                                                                }
                                                                onCommit={(value) =>
                                                                    updateAssignment(
                                                                        assignment.assignmentId,
                                                                        { expr: value }
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    );
                                                }
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="transition-empty-state">
                                    Select a transition in step 1.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="step-card">
                        <div className="step-card-header">
                            <span className="step-number">4</span>
                            <span className="step-title">Target</span>
                        </div>

                        <div className="step-card-body transition-step-body">
                            {selectedTransition ? (
                                <>
                                    <div className="transition-target-autocomplete">
                                        <input
                                            className="slot-field-edit transition-target-input"
                                            type="text"
                                            value={targetQuery}
                                            placeholder="Type a target node..."
                                            autoComplete="off"
                                            onChange={(event) => {
                                                const next = event.target.value;
                                                setTargetQuery(next);
                                                setTargetAutocompleteOpen(
                                                    next.trim().length > 0
                                                );
                                                setActiveTargetSuggestionIndex(
                                                    next.trim().length > 0 ? 0 : -1
                                                );
                                            }}
                                            onFocus={() => {
                                                if (
                                                    targetQuery.trim() &&
                                                    matchingTargets.length > 0
                                                ) {
                                                    setTargetAutocompleteOpen(true);
                                                    setActiveTargetSuggestionIndex(0);
                                                }
                                            }}
                                            onBlur={() =>
                                                window.setTimeout(() => {
                                                    setTargetAutocompleteOpen(false);
                                                    setActiveTargetSuggestionIndex(-1);
                                                }, 120)
                                            }
                                            onKeyDown={handleTargetKeyDown}
                                        />

                                        {targetAutocompleteOpen &&
                                            matchingTargets.length > 0 && (
                                                <div className="transition-target-suggestions">
                                                    {matchingTargets.map(
                                                        (target, index) => (
                                                            <button
                                                                type="button"
                                                                key={target.id}
                                                                className={`transition-target-suggestion ${
                                                                    index ===
                                                                    activeTargetSuggestionIndex
                                                                        ? "active"
                                                                        : ""
                                                                }`}
                                                                onMouseDown={(event) => {
                                                                    event.preventDefault();
                                                                    selectTarget(target);
                                                                }}
                                                            >
                                                                <span className="transition-target-suggestion-name">
                                                                    {target.displayName ||
                                                                        target.label ||
                                                                        target.id}
                                                                </span>
                                                                <span className="transition-target-suggestion-path">
                                                                    {target.packageName
                                                                        ? `${target.packageName}.${
                                                                            target.skillName ||
                                                                            target.label ||
                                                                            ""
                                                                        }`
                                                                        : target.fullSkillName ||
                                                                        target.id}
                                                                </span>
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                    </div>

                                    {selectedTransition.target ? (
                                        <div className="transition-selected-target">
                                            <FiArrowRight />
                                            <span>
                                                {getTargetDisplayName(
                                                    selectedTransition.target,
                                                    availableTargets
                                                )}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="transition-help-text">
                                            Start typing and choose a target from the
                                            autocomplete results.
                                        </div>
                                    )}

                                    {selectedEventDescription && (
                                        <div className="transition-help-text">
                                            Event: {selectedEventDescription}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="transition-empty-state">
                                    Select a transition in step 1.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bottom-drawer-footer">
                    <button
                        className="back-button"
                        style={{ margin: 0, height: "38px" }}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="filter-button transition-primary-button"
                        style={{ margin: 0, height: "38px", padding: "0 24px" }}
                        onClick={handleSave}
                    >
                        <FiCheck /> Save & Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConditionModal;
