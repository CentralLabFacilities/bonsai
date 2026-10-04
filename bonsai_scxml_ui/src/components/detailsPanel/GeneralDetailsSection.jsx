import { useMemo, useState } from "react";
import { FiActivity, FiChevronDown, FiExternalLink, FiLayers } from "react-icons/fi";
import ParallelLaneEditor from "./ParallelLaneEditor.jsx";
import { NodeReferenceCard } from "./DetailsPanelPrimitives.jsx";
import { getExitTokenType } from "./exitTokens.js";
import {
    createDetailsTargetIndex,
    getMatchingTargetNodeOptions,
    getSemanticTargetNodeIds as selectSemanticTargetNodeIds,
    getSkillPackageName,
} from "../detailsPanelSelectors.js";

const formatResourceKeys = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "—";
    const keys = items
        .map((item) => (typeof item === "string" ? item : item?.key || ""))
        .filter(Boolean);
    return keys.length > 0 ? keys.join(", ") : "—";
};

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
    const [openTargetSelector, setOpenTargetSelector] = useState(null);
    const [targetQueries, setTargetQueries] = useState({});

    const targetNodeIndex = useMemo(
        () => createDetailsTargetIndex(availableTargetNodes, skillOutgoingTransitions, selectedNode.id),
        [availableTargetNodes, skillOutgoingTransitions, selectedNode.id]
    );

    const getSemanticTargetNodeIds = (event) =>
        selectSemanticTargetNodeIds(event, targetNodeIndex);

    const resolveEventTargetNodeId = (event) =>
        getSemanticTargetNodeIds(event)[0] || null;

    const firstEditableExitToken = editableExitTokens[0] || null;
    const transitionButtonSourceId = selectedNode.id;
    const transitionButtonEventId = isContainerState
        ? ""
        : firstEditableExitToken?.id || null;
    const transitionButtonTargetId =
        !isContainerState && firstEditableExitToken
            ? resolveEventTargetNodeId(firstEditableExitToken)
            : null;
    const canOpenTransitionPanel =
        isContainerState || Boolean(transitionButtonSourceId && transitionButtonEventId);

    const getTargetSelectorKey = (event, index) =>
        `${selectedNode.id}:${event.id}:${index}`;

    const getCurrentTargetDisplayName = (event) => {
        const targetNodeId = resolveEventTargetNodeId(event);
        if (!targetNodeId) return "";
        const option = targetNodeIndex.byId.get(targetNodeId);
        return option?.displayName || targetNodeId;
    };

    const getTargetQuery = (event, index) => {
        const key = getTargetSelectorKey(event, index);
        if (Object.prototype.hasOwnProperty.call(targetQueries, key)) {
            return targetQueries[key];
        }
        return getCurrentTargetDisplayName(event);
    };

    const getMatchingTargetNodes = (query) =>
        getMatchingTargetNodeOptions(query, targetNodeIndex);

    const selectExistingTarget = (event, index, option) => {
        const key = getTargetSelectorKey(event, index);
        setTargetQueries((previous) => ({
            ...previous,
            [key]: option.displayName,
        }));
        setOpenTargetSelector(null);
        onSetEventTarget?.(
            {
                ...event,
                target: resolveEventTargetNodeId(event) || event.target,
            },
            option.id
        );
    };

    const handleTargetKeyDown = (keyboardEvent, event, index) => {
        if (keyboardEvent.key !== "Enter") return;
        keyboardEvent.preventDefault();
        const query = getTargetQuery(event, index).trim();
        if (!query) return;
        const exactMatch = targetNodeIndex.byExactQuery.get(query.toLowerCase());
        if (exactMatch) {
            selectExistingTarget(event, index, exactMatch);
            return;
        }
        const matches = getMatchingTargetNodes(query);
        if (matches.length === 1) {
            selectExistingTarget(event, index, matches[0]);
        }
    };

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
                                <div
                                    className={`slot-text-field compact-slot-card exit-token-card exit-token-${getExitTokenType(
                                        event.id
                                    )}`}
                                    key={`${event.id}-${index}`}
                                    onMouseEnter={() =>
                                        onHoverTransitionNode?.(
                                            resolveEventTargetNodeId(event)
                                        )
                                    }
                                    onMouseLeave={() =>
                                        onHoverTransitionNode?.(null)
                                    }
                                >
                                    <div className="compact-slot-header">
                                        <span className="compact-slot-name detail-card-title">
                                            {event.id}
                                        </span>

                                        <div className="exit-token-header-actions">
                                            <span
                                                className={`detail-badge exit-token-badge exit-token-badge-${getExitTokenType(
                                                    event.id
                                                )}`}
                                            >
                                                Exit Token
                                            </span>
                                        </div>
                                    </div>

                                    {event.description && (
                                        <div className="detail-description">
                                            {event.description}
                                        </div>
                                    )}

                                    {(() => {
                                        const targetNodeIds =
                                            getSemanticTargetNodeIds(event);
                                        if (targetNodeIds.length === 0) {
                                            return null;
                                        }

                                        return (
                                            <div className="exit-token-node-references">
                                                {targetNodeIds.map((targetNodeId) => {
                                                    const targetOption =
                                                        targetNodeIndex.byId.get(targetNodeId);

                                                    return (
                                                        <NodeReferenceCard
                                                            key={`${event.id}-${targetNodeId}`}
                                                            nodeId={targetNodeId}
                                                            name={
                                                                targetOption?.displayName ||
                                                                targetNodeId
                                                            }
                                                            badge="Target"
                                                            onNavigate={
                                                                onNavigateTransitionNode
                                                            }
                                                            onHover={
                                                                onHoverTransitionNode
                                                            }
                                                            hoverFallbackId={targetNodeId}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    <div className="editable-field">
                                        <label className="editable-field-label">
                                            Target
                                        </label>

                                        {(() => {
                                            const selectorKey =
                                                getTargetSelectorKey(
                                                    event,
                                                    index
                                                );

                                            const query =
                                                getTargetQuery(
                                                    event,
                                                    index
                                                );

                                            const isOpen =
                                                openTargetSelector ===
                                                selectorKey;
                                            const matches = isOpen
                                                ? getMatchingTargetNodes(query)
                                                : [];

                                            return (
                                                <div className="exit-target-selector">
                                                    <div className="exit-target-input-row">
                                                        <input
                                                            id={`transition-target-${selectedNode.id}-${index}`}
                                                            className="exit-target-input"
                                                            type="text"
                                                            value={query}
                                                            placeholder="Type or select an existing node..."
                                                            autoComplete="off"
                                                            onFocus={() =>
                                                                setOpenTargetSelector(
                                                                    selectorKey
                                                                )
                                                            }
                                                            onChange={(e) => {
                                                                setTargetQueries(
                                                                    (
                                                                        previous
                                                                    ) => ({
                                                                        ...previous,
                                                                        [selectorKey]:
                                                                        e
                                                                            .target
                                                                            .value,
                                                                    })
                                                                );

                                                                setOpenTargetSelector(
                                                                    selectorKey
                                                                );
                                                            }}
                                                            onKeyDown={(
                                                                keyboardEvent
                                                            ) =>
                                                                handleTargetKeyDown(
                                                                    keyboardEvent,
                                                                    event,
                                                                    index
                                                                )
                                                            }
                                                            onBlur={() =>
                                                                window.setTimeout(
                                                                    () =>
                                                                        setOpenTargetSelector(
                                                                            (
                                                                                current
                                                                            ) =>
                                                                                current ===
                                                                                selectorKey
                                                                                    ? null
                                                                                    : current
                                                                        ),
                                                                    120
                                                                )
                                                            }
                                                        />

                                                        <button
                                                            type="button"
                                                            className="exit-target-dropdown-button"
                                                            title="Show nodes in current workflow"
                                                            onMouseDown={(e) =>
                                                                e.preventDefault()
                                                            }
                                                            onClick={() =>
                                                                setOpenTargetSelector(
                                                                    (
                                                                        current
                                                                    ) =>
                                                                        current ===
                                                                        selectorKey
                                                                            ? null
                                                                            : selectorKey
                                                                )
                                                            }
                                                        >
                                                            <FiChevronDown />
                                                        </button>
                                                    </div>

                                                    {isOpen && (
                                                        <div className="exit-target-suggestions">
                                                            {matches.length >
                                                            0 ? (
                                                                matches.map(
                                                                    (
                                                                        option
                                                                    ) => (
                                                                        <button
                                                                            type="button"
                                                                            className={`exit-target-suggestion ${
                                                                                option.id ===
                                                                                event.target
                                                                                    ? "selected"
                                                                                    : ""
                                                                            }`}
                                                                            key={
                                                                                option.id
                                                                            }
                                                                            onMouseDown={(
                                                                                e
                                                                            ) =>
                                                                                e.preventDefault()
                                                                            }
                                                                            onClick={() =>
                                                                                selectExistingTarget(
                                                                                    event,
                                                                                    index,
                                                                                    option
                                                                                )
                                                                            }
                                                                        >
                                                                            <span className="exit-target-suggestion-name">
                                                                                {
                                                                                    option.displayName
                                                                                }
                                                                            </span>

                                                                            <span className="exit-target-suggestion-path">
                                                                                {option.isReference
                                                                                    ? `Reference ID: ${option.referenceId}`
                                                                                    : option.packageName
                                                                                        ? `${option.packageName}.${option.skillName}`
                                                                                        : option.fullSkillName}
                                                                            </span>
                                                                        </button>
                                                                    )
                                                                )
                                                            ) : (
                                                                <div className="exit-target-no-match">
                                                                    No matching nodes in this workflow
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GeneralDetailsSection;
