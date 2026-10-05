import { memo, useMemo, useRef, useState } from "react";
import { FiActivity, FiChevronDown, FiExternalLink, FiLayers } from "react-icons/fi";
import ParallelLaneEditor from "./ParallelLaneEditor.jsx";
import { NodeReferenceCard } from "./DetailsPanelPrimitives.jsx";
import {
    createDetailsTargetIndex,
    getExitTokenType,
    getMatchingTargetNodeOptions,
    getSemanticTargetNodeIds as selectSemanticTargetNodeIds,
    getSkillPackageName,
} from "./selectors.js";

const formatResourceKeys = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "—";
    const keys = items
        .map((item) => (typeof item === "string" ? item : item?.key || ""))
        .filter(Boolean);
    return keys.length > 0 ? keys.join(", ") : "—";
};

const ExitTokenRow = memo(function ExitTokenRow({
    nodeId,
    event,
    index,
    targetNodeIndex,
    onSetEventTarget,
    onNavigateTransitionNode,
    onHoverTransitionNode,
}) {
    const targetNodeIds = selectSemanticTargetNodeIds(event, targetNodeIndex);
    const targetNodeId = targetNodeIds[0] || null;
    const displayName = String(targetNodeIndex.byId.get(targetNodeId)?.displayName || targetNodeId || "");
    const source = JSON.stringify([event.target, targetNodeIds, displayName]);
    const [draft, setDraft] = useState({ source, value: displayName, committed: displayName, selectedId: null });
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef(null);

    // Target identities/names can change on undo or rename; unrelated hover renders cannot reset typing.
    if (draft.source !== source) {
        setDraft({ source, value: displayName, committed: displayName, selectedId: null });
        setIsOpen(false);
        setActiveIndex(-1);
    }

    const matches = isOpen ? getMatchingTargetNodeOptions(draft.value, targetNodeIndex) : [];
    const visibleActiveIndex = Math.min(activeIndex, matches.length - 1);
    const inputId = `transition-target-${nodeId}-${index}`;
    const suggestionsId = `${inputId}-suggestions`;

    const selectTarget = (option) => {
        const isCurrentTarget = draft.selectedId === null && targetNodeIds.length === 1 && targetNodeId === option.id && event.target === option.id;
        if (draft.selectedId !== option.id && !isCurrentTarget) {
            const accepted = onSetEventTarget?.(
                { ...event, target: targetNodeId || event.target },
                option.id,
            );
            if (accepted === false) {
                setDraft({ ...draft, value: draft.committed });
                return;
            }
        }
        setDraft({ ...draft, value: option.displayName, committed: option.displayName, selectedId: option.id });
        inputRef.current?.focus();
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (keyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            if (draft.value !== draft.committed) setDraft({ ...draft, value: draft.committed });
            inputRef.current?.focus();
            setIsOpen(false);
            setActiveIndex(-1);
            return;
        }
        if (keyboardEvent.target !== inputRef.current) return;

        if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
            const options = isOpen ? matches : getMatchingTargetNodeOptions(draft.value, targetNodeIndex);
            if (options.length === 0) return;
            keyboardEvent.preventDefault();
            setIsOpen(true);
            const current = Math.min(activeIndex, options.length - 1);
            setActiveIndex(keyboardEvent.key === "ArrowDown"
                ? current < options.length - 1 ? current + 1 : 0
                : current > 0 ? current - 1 : options.length - 1);
            return;
        }
        if (keyboardEvent.key !== "Enter") return;
        keyboardEvent.preventDefault();

        if (isOpen && visibleActiveIndex >= 0) {
            selectTarget(matches[visibleActiveIndex]);
            return;
        }
        const query = draft.value.trim();
        if (!query) return;
        const exactMatch = targetNodeIndex.byExactQuery.get(query.toLowerCase());
        const options = getMatchingTargetNodeOptions(query, targetNodeIndex);
        const match = exactMatch || (options.length === 1 ? options[0] : null);
        if (match) selectTarget(match);
    };

    return (
        <div
            className={`slot-text-field compact-slot-card exit-token-card exit-token-${getExitTokenType(event.id)}`}
            onMouseEnter={() => onHoverTransitionNode?.(targetNodeId)}
            onMouseLeave={() => onHoverTransitionNode?.(null)}
        >
            <div className="compact-slot-header">
                <span className="compact-slot-name detail-card-title">{event.id}</span>
                <div className="exit-token-header-actions">
                    <span className={`detail-badge exit-token-badge exit-token-badge-${getExitTokenType(event.id)}`}>
                        Exit Token
                    </span>
                </div>
            </div>

            {event.description && <div className="detail-description">{event.description}</div>}

            {targetNodeIds.length > 0 && (
                <div className="exit-token-node-references">
                    {targetNodeIds.map((id) => (
                        <NodeReferenceCard
                            key={`${event.id}-${id}`}
                            nodeId={id}
                            name={targetNodeIndex.byId.get(id)?.displayName || id}
                            badge="Target"
                            onNavigate={onNavigateTransitionNode}
                            onHover={onHoverTransitionNode}
                            hoverFallbackId={id}
                        />
                    ))}
                </div>
            )}

            <div className="editable-field">
                <label className="editable-field-label" htmlFor={inputId}>Target</label>
                <div
                    className="exit-target-selector"
                    onKeyDown={handleKeyDown}
                    onBlur={(blurEvent) => {
                        if (blurEvent.currentTarget.contains(blurEvent.relatedTarget)) return;
                        if (draft.value !== draft.committed) setDraft({ ...draft, value: draft.committed });
                        setIsOpen(false);
                        setActiveIndex(-1);
                    }}
                >
                    <div className="exit-target-input-row">
                        <input
                            id={inputId}
                            ref={inputRef}
                            className="exit-target-input"
                            type="text"
                            value={draft.value}
                            placeholder="Type or select an existing node..."
                            autoComplete="off"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={isOpen}
                            aria-controls={isOpen ? suggestionsId : undefined}
                            aria-activedescendant={isOpen && visibleActiveIndex >= 0
                                ? `${suggestionsId}-${visibleActiveIndex}` : undefined}
                            onFocus={() => setIsOpen(true)}
                            onChange={(changeEvent) => {
                                setDraft({ ...draft, value: changeEvent.target.value });
                                setIsOpen(true);
                                setActiveIndex(-1);
                            }}
                        />
                        <button
                            type="button"
                            className="exit-target-dropdown-button"
                            title="Show nodes in current workflow"
                            aria-label="Show nodes in current workflow"
                            aria-expanded={isOpen}
                            aria-controls={isOpen ? suggestionsId : undefined}
                            onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
                            onClick={() => {
                                setIsOpen((open) => !open);
                                setActiveIndex(-1);
                            }}
                        >
                            <FiChevronDown />
                        </button>
                    </div>

                    {isOpen && (
                        <div className="exit-target-suggestions" id={suggestionsId} role="listbox">
                            {matches.length > 0 ? matches.map((option, optionIndex) => (
                                <button
                                    type="button"
                                    className={`exit-target-suggestion ${targetNodeIds.includes(option.id) ? "selected" : ""}`}
                                    key={option.id}
                                    id={`${suggestionsId}-${optionIndex}`}
                                    role="option"
                                    aria-selected={optionIndex === visibleActiveIndex}
                                    onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
                                    onClick={() => selectTarget(option)}
                                >
                                    <span className="exit-target-suggestion-name">{option.displayName}</span>
                                    <span className="exit-target-suggestion-path">
                                        {option.isReference
                                            ? `Reference ID: ${option.referenceId}`
                                            : option.packageName
                                                ? `${option.packageName}.${option.skillName}`
                                                : option.fullSkillName}
                                    </span>
                                </button>
                            )) : (
                                <div className="exit-target-no-match">No matching nodes in this workflow</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

function GeneralDetailsSection({
    selectedNode,
    hasInitialNode,
    isSubMachine,
    isContainerState,
    usesEditorInstanceId,
    skillDisplayName,
    hasNopSend,
    editableExitTokens = [],
    availableTargetNodes = [],
    skillOutgoingTransitions = [],
    containerOutgoingTransitions = [],
    parallelLanes = [],
    onSetInitial,
    onUpdateName,
    onUpdateNameCommit,
    onUpdateSrc,
    onSetEventTarget,
    onNavigateTransitionNode,
    onHoverTransitionNode,
    onOpenTransitionPanel,
    onAddParallelLane,
    onRenameParallelLane,
    onMoveParallelLane,
    onDeleteParallelLane,
}) {
    const targetNodeIndex = useMemo(
        () => createDetailsTargetIndex(availableTargetNodes, skillOutgoingTransitions, selectedNode.id),
        [availableTargetNodes, skillOutgoingTransitions, selectedNode.id]
    );

    const firstEditableExitToken = editableExitTokens[0] || null;
    const transitionButtonSourceId = selectedNode.id;
    const transitionButtonEventId = isContainerState
        ? ""
        : firstEditableExitToken?.id || null;
    const transitionButtonTargetId =
        !isContainerState && firstEditableExitToken
            ? selectSemanticTargetNodeIds(firstEditableExitToken, targetNodeIndex)[0] || null
            : null;
    const canOpenTransitionPanel =
        isContainerState || Boolean(transitionButtonSourceId && transitionButtonEventId);

    return (
        <div className="allgemein-container">
            {selectedNode.data.description && (
                <div className="node-description">
                    {selectedNode.data.description}
                </div>
            )}

            <div className="description-header">
                <h3>
                    {isSubMachine
                        ? "Sub-Machine View"
                        : "General View"}
                </h3>

                <button
                    className="initial-button"
                    onClick={onSetInitial}
                    title={
                        selectedNode.data.isInitial
                            ? "This state is initial"
                            : hasInitialNode
                                ? "Replace the current initial state"
                                : "Set as initial state"
                    }
                >
                    {selectedNode.data.isInitial
                        ? "Initial set"
                        : hasInitialNode
                            ? "Set initial instead"
                            : "Set initial"}
                </button>
            </div>

            {isSubMachine ? (
                <>
                    <div className="field-row">
                        <span className="field-label">Type:</span>

                        <span
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                color: "#c084fc",
                                fontWeight: "bold",
                                fontSize: "13px",
                            }}
                        >
                            <FiLayers />
                            Sub-State-Machine
                        </span>
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            State ID:
                        </label>

                        <input
                            className="text-field"
                            type="text"
                            value={selectedNode.data.label}
                            onChange={(e) =>
                                onUpdateName(e.target.value)
                            }
                            onBlur={(e) =>
                                onUpdateNameCommit?.(e.target.value)
                            }
                        />
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            Source (src):
                        </label>

                        <input
                            className="text-field"
                            type="text"
                            value={selectedNode.data.src || ""}
                            placeholder="${EXERCISE}/..."
                            onChange={(e) =>
                                onUpdateSrc?.(
                                    selectedNode.id,
                                    e.target.value,
                                    false
                                )
                            }
                            onBlur={(e) =>
                                onUpdateSrc?.(
                                    selectedNode.id,
                                    e.target.value,
                                    true
                                )
                            }
                        />
                    </div>

                    <button
                        className="menu-button"
                        style={{
                            marginTop: "6px",
                            width: "100%",
                            justifyContent: "center",
                        }}
                        onClick={() =>
                            selectedNode.data.onOpenSubMachine?.(
                                selectedNode.data.src,
                                selectedNode.data.label
                            )
                        }
                    >
                        <FiExternalLink />
                        Open in a new tab
                    </button>
                </>
            ) : isContainerState ? (
                <>
                    <div className="field-row">
                        <label className="field-label">
                            Name:
                        </label>

                        <input
                            className="text-field"
                            type="text"
                            value={selectedNode.data.label || ""}
                            onChange={(e) =>
                                onUpdateName(e.target.value)
                            }
                            onBlur={(e) =>
                                onUpdateNameCommit?.(e.target.value)
                            }
                        />
                    </div>

                    {selectedNode.type === "parallel" && (
                        <ParallelLaneEditor
                            lanes={parallelLanes}
                            onAdd={onAddParallelLane}
                            onRename={onRenameParallelLane}
                            onMove={onMoveParallelLane}
                            onDelete={onDeleteParallelLane}
                        />
                    )}
                </>
            ) : (
                <>
                    <div className="field-row">
                        <span className="field-label">
                            Package:
                        </span>

                        <span className="field-value">
                            {getSkillPackageName(
                                selectedNode.data.fullSkillName
                            ) || "—"}
                        </span>
                    </div>

                    <div className="field-row">
                        <span className="field-label">
                            Skill:
                        </span>

                        <span className="field-value">
                            {skillDisplayName}
                        </span>
                    </div>

                    <div className="field-row">
                        <label className="field-label">
                            {usesEditorInstanceId ? "Instance ID:" : "Name:"}
                        </label>

                        <input
                            className="text-field"
                            type="text"
                            value={
                                usesEditorInstanceId
                                    ? selectedNode.data.editorInstanceId || ""
                                    : selectedNode.data.fullSkillName
                                    ?.split("#")[1] || ""
                            }
                            onChange={(e) =>
                                onUpdateName(e.target.value)
                            }
                            onBlur={(e) =>
                                onUpdateNameCommit?.(e.target.value)
                            }
                        />
                    </div>

                    <div className="field-row">
                        <span className="field-label">
                            Sensors:
                        </span>

                        <span className="field-value">
                            {formatResourceKeys(selectedNode.data.sensors)}
                        </span>
                    </div>

                    <div className="field-row">
                        <span className="field-label">
                            Actuators:
                        </span>

                        <span className="field-value">
                            {formatResourceKeys(selectedNode.data.actuators)}
                        </span>
                    </div>
                </>
            )}

            {!hasNopSend && (
                <div className="events-container">
                    <div className="compact-slot-header">
                        <h3>Exit Tokens</h3>

                        {canOpenTransitionPanel && (
                            <button
                                type="button"
                                className="exit-token-transition-button"
                                title="Open transition editor"
                                onClick={() => {
                                    if (isContainerState) {
                                        onOpenTransitionPanel?.(
                                            selectedNode.id,
                                            "",
                                            null,
                                            {
                                                containerMode: true,
                                                containerTransitions:
                                                containerOutgoingTransitions,
                                            }
                                        );
                                        return;
                                    }

                                    onOpenTransitionPanel?.(
                                        transitionButtonSourceId,
                                        transitionButtonEventId,
                                        transitionButtonTargetId
                                    );
                                }}
                            >
                                <FiActivity size={12} />
                                Transitions
                            </button>
                        )}
                    </div>

                    <div className="event-list">
                        {isContainerState &&
                            containerOutgoingTransitions.map((transition) => (
                                <div
                                    className={`slot-text-field compact-slot-card exit-token-card exit-token-${getExitTokenType(
                                        transition.eventId
                                    )}`}
                                    key={`container-${transition.edgeId}`}
                                    onMouseEnter={() =>
                                        onHoverTransitionNode?.(
                                            transition.targetNodeId
                                        )
                                    }
                                    onMouseLeave={() =>
                                        onHoverTransitionNode?.(null)
                                    }
                                >
                                    <div className="compact-slot-header">
                                        <span className="compact-slot-name detail-card-title">
                                            {transition.eventDisplayName}
                                        </span>

                                        <div className="exit-token-header-actions">
                                            <span
                                                className={`detail-badge exit-token-badge exit-token-badge-${getExitTokenType(
                                                    transition.eventId
                                                )}`}
                                            >
                                                Exit Token
                                            </span>
                                        </div>
                                    </div>

                                    <div className="exit-token-node-references">
                                        <NodeReferenceCard
                                            nodeId={transition.sourceNodeId}
                                            name={transition.sourceDisplayName}
                                            badge="Source skill"
                                            onNavigate={onNavigateTransitionNode}
                                            onHover={onHoverTransitionNode}
                                            hoverFallbackId={transition.targetNodeId}
                                        />
                                        <NodeReferenceCard
                                            nodeId={transition.targetNodeId}
                                            name={transition.targetDisplayName}
                                            badge="Target"
                                            onNavigate={onNavigateTransitionNode}
                                            onHover={onHoverTransitionNode}
                                            hoverFallbackId={transition.targetNodeId}
                                        />
                                    </div>
                                </div>
                            ))}

                        {!isContainerState && editableExitTokens.map((event, index) => (
                            <ExitTokenRow
                                key={`${selectedNode.id}:${event.id}:${index}`}
                                nodeId={selectedNode.id}
                                event={event}
                                index={index}
                                targetNodeIndex={targetNodeIndex}
                                onSetEventTarget={onSetEventTarget}
                                onNavigateTransitionNode={onNavigateTransitionNode}
                                onHoverTransitionNode={onHoverTransitionNode}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GeneralDetailsSection;
