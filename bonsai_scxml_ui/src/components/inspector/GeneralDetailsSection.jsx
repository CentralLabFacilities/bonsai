import { memo, useMemo } from "react";
import { FiActivity, FiExternalLink, FiLayers } from "react-icons/fi";
import ParallelLaneEditor from "./ParallelLaneEditor.jsx";
import { NodeReferenceCard } from "./DetailsPanelPrimitives.jsx";
import {
    createDetailsTargetIndex,
    getExitTokenType,
    getSkillPackageName,
} from "./selectors.js";

const formatResourceKeys = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "—";
    const keys = items
        .map((item) => (typeof item === "string" ? item : item?.key || ""))
        .filter(Boolean);
    return keys.length > 0 ? keys.join(", ") : "—";
};

/** The badges reflect transitions, not exit-token definitions without an edge. */
function TransitionDetailBadges({ transitions, onOpen, onHover }) {
    const conditioned = transitions.find((transition) => String(transition.cond || "").trim());
    const assigned = transitions.find((transition) =>
        Array.isArray(transition.assignments) &&
        transition.assignments.some((assignment) => assignment?.location)
    );
    if (!conditioned && !assigned) return null;
    return (
        <span className="exit-token-transition-annotations">
            {conditioned && <button type="button" className="editor-transition-annotation"
                title={`Condition: ${conditioned.cond}`}
                aria-label="Edit transition condition"
                onMouseEnter={(event) => onHover?.(conditioned.edgeId, event)}
                onMouseLeave={(event) => onHover?.(null, event)}
                onFocus={(event) => onHover?.(conditioned.edgeId, event)}
                onBlur={(event) => onHover?.(null, event)}
                onClick={(event) => { event.stopPropagation(); onOpen?.(conditioned, "condition"); }}>c</button>}
            {assigned && <button type="button" className="editor-transition-annotation"
                title={assigned.assignments.filter((entry) => entry?.location)
                    .map((entry) => `${entry.location} = ${entry.expr || ""}`).join("\n")}
                aria-label="Edit transition assignments"
                onMouseEnter={(event) => onHover?.(assigned.edgeId, event)}
                onMouseLeave={(event) => onHover?.(null, event)}
                onFocus={(event) => onHover?.(assigned.edgeId, event)}
                onBlur={(event) => onHover?.(null, event)}
                onClick={(event) => { event.stopPropagation(); onOpen?.(assigned, "assignment"); }}>a</button>}
        </span>
    );
}

/** One exit-token definition with zero or more actual outgoing transitions. */
const ExitTokenRow = memo(function ExitTokenRow({
    nodeId,
    event,
    index,
    targetNodeIndex,
    eventVariants = [],
    onNavigateTransitionNode,
    onHoverTransitionNode,
    onHoverTransitionEdge,
    onOpenTransitionPanel,
    outgoingTransitions = [],
}) {
    // The graph edges, not the individual duplicated SCXML event entries,
    // determine the targets shown here. Keep each edge separate: two conditions
    // can lead from the same exit token to the same skill.
    const targets = outgoingTransitions.length > 0
        ? outgoingTransitions.map((transition) => ({
            id: transition.targetNodeId,
            transition,
            key: transition.edgeId || `${transition.targetNodeId}-${transition.cond || ""}`,
        }))
        : eventVariants
            .filter((variant) => variant?.target)
            .map((variant) => ({
                id: targetNodeIndex.byAlias.get(variant.target)?.id || variant.target,
                transition: null,
                key: variant.target,
            }))
            .filter((item, itemIndex, items) =>
                targetNodeIndex.byId.has(item.id) &&
                items.findIndex((other) => other.id === item.id) === itemIndex
            );

    return (
        <div className={`slot-text-field compact-slot-card exit-token-card exit-token-${getExitTokenType(event.id)}`}>
            <div className="compact-slot-header">
                <button
                    id={`exit-token-${nodeId}-${index}`}
                    type="button"
                    className="compact-slot-name detail-card-title exit-token-name-action"
                    title={`Edit transitions for ${event.id}`}
                    onClick={() => onOpenTransitionPanel?.(nodeId, event.id, null)}
                >
                    {event.id}
                </button>
                <span className={`detail-badge exit-token-badge exit-token-badge-${getExitTokenType(event.id)}`}>
                    Exit Token
                </span>
            </div>

            {event.description && <div className="detail-description">{event.description}</div>}

            {targets.length > 0 && (
                <div className="exit-token-node-references">
                    {targets.map(({ id, transition, key }, targetIndex) => (
                        <div
                            className="slot-text-field compact-slot-card slot-access-skill-card exit-token-node-reference exit-token-target-row"
                            key={`${event.id}-${key}-${targetIndex}`}
                        >
                            <div className="compact-slot-header exit-token-node-reference-header">
                                <button
                                    type="button"
                                    className="exit-token-target-link"
                                    title={`Open ${targetNodeIndex.byId.get(id)?.displayName || id}`}
                                    onClick={() => onNavigateTransitionNode?.(id)}
                                    onMouseEnter={(pointerEvent) => onHoverTransitionNode?.(id, pointerEvent)}
                                    onMouseLeave={(pointerEvent) => onHoverTransitionNode?.(null, pointerEvent)}
                                    onFocus={(focusEvent) => onHoverTransitionNode?.(id, focusEvent)}
                                    onBlur={(blurEvent) => onHoverTransitionNode?.(null, blurEvent)}
                                >
                                    {targetNodeIndex.byId.get(id)?.displayName || id}
                                </button>
                                {transition && (
                                    <TransitionDetailBadges
                                        transitions={[transition]}
                                        onHover={onHoverTransitionEdge}
                                        onOpen={(item, section) => onOpenTransitionPanel?.(
                                            nodeId, event.id, item.targetNodeId,
                                            { edgeId: item.edgeId, focusSection: section }
                                        )}
                                    />
                                )}
                                <div className="exit-token-target-suffix">
                                    <span className="slot-access-badge exit-token-node-reference-badge">Target</span>
                                    <FiExternalLink className="slot-access-open-icon" aria-hidden="true" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
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
    onNavigateTransitionNode,
    onHoverTransitionNode,
    onHoverTransitionEdge,
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
    const transitionButtonTargetId = !isContainerState && firstEditableExitToken
        ? skillOutgoingTransitions.find((transition) => transition.eventId === firstEditableExitToken.id)?.targetNodeId || null
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
                                    onMouseEnter={(event) =>
                                        onHoverTransitionNode?.(transition.targetNodeId, event)
                                    }
                                    onMouseLeave={(event) =>
                                        onHoverTransitionNode?.(null, event)
                                    }
                                >
                                    <div className="compact-slot-header">
                                        <span className="compact-slot-name detail-card-title">
                                            {transition.eventDisplayName}
                                        </span>

                                        <div className="exit-token-header-actions">
                                            <TransitionDetailBadges
                                                transitions={[transition]}
                                                onHover={onHoverTransitionEdge}
                                                onOpen={(item, section) => onOpenTransitionPanel?.(
                                                    selectedNode.id, "", null,
                                                    { containerMode: true, containerTransitions: containerOutgoingTransitions,
                                                        edgeId: item.edgeId, focusSection: section }
                                                )}
                                            />
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
                                onNavigateTransitionNode={onNavigateTransitionNode}
                                onHoverTransitionNode={onHoverTransitionNode}
                                onHoverTransitionEdge={onHoverTransitionEdge}
                                onOpenTransitionPanel={onOpenTransitionPanel}
                                eventVariants={(selectedNode.data.events || []).filter((variant) =>
                                    variant?.id === event.id && !variant.transitionHandleId
                                )}
                                outgoingTransitions={skillOutgoingTransitions.filter((transition) =>
                                    transition.eventId === event.id
                                )}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GeneralDetailsSection;
