import { FiLink2 } from "react-icons/fi";
import StateActionsEditor from "../StateActionsEditor.jsx";
import TypedValueEditor from "../TypedValueEditor.jsx";
import { SkillSlotSection } from "./SlotDetailsPanel.jsx";

function CloneReferencesSection({ cloneNodes = [], onNavigateClone }) {
    return (
        <div className="allgemein-container">
            <div className="description-header">
                <h3>References</h3>
            </div>

            <div className="skill-clone-detail-card">
                <div className="detail-description">
                    Select a reference to move the editor view to it.
                </div>

                {cloneNodes.map((cloneNode, index) => (
                    <button
                        key={cloneNode.id}
                        type="button"
                        className="skill-clone-source-button"
                        onClick={() => onNavigateClone?.(cloneNode.id)}
                        title="Go to this reference"
                    >
                        <FiLink2 /> Reference {index + 1}
                        {cloneNode.data?.editorInstanceId
                            ? ` · ${cloneNode.data.editorInstanceId}`
                            : ""}
                        {cloneNode.data?.label
                            ? ` · ${cloneNode.data.label}`
                            : ""}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ParametersSection({
    selectedNode,
    valueVariables = [],
    onUpdateParameter,
}) {
    return (
        <div className="slots-container">
            <h3>Parameters</h3>

            <div className="slot-list">
                {(selectedNode.data.params || []).map((param, index) => (
                    <div
                        className="slot-text-field parameter-card"
                        key={`${selectedNode.id}:${param.key}`}
                    >
                        <div className="parameter-card-header">
                            <div className="parameter-name">
                                {param.key}
                                {param.required && (
                                    <span
                                        className="parameter-required-star"
                                        title="Required parameter"
                                    >
                                        *
                                    </span>
                                )}
                            </div>

                            <div className="parameter-badges">
                                <span
                                    className={`parameter-type-badge parameter-type-${String(
                                        param.type || "other"
                                    )
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "-")}`}
                                >
                                    {param.type || "Unknown"}
                                </span>

                                {param.required && (
                                    <span className="parameter-required-badge">
                                        Required
                                    </span>
                                )}
                            </div>
                        </div>

                        {param.description && (
                            <div className="parameter-description">
                                {param.description}
                            </div>
                        )}

                        <TypedValueEditor
                            id={`param-${selectedNode.id}-${index}`}
                            value={param.expr || ""}
                            expectedType={param.type}
                            variables={valueVariables}
                            inputClassName="parameter-value-input"
                            placeholder={
                                param.default != null
                                    ? String(param.default)
                                    : param.type
                                        ? `${param.type} value or @variable`
                                        : "Enter value"
                            }
                            onCommit={(value) =>
                                onUpdateParameter(index, value, true)
                            }
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function SlotsSection({
    selectedNode,
    availableSlotPaths = [],
    onUpdateInSlotPath,
    onUpdateOutSlotPath,
    onCheckSlots,
}) {
    return (
        <div className="slots-container">
            <h3>Slots</h3>

            <div className="slot-list">
                <SkillSlotSection
                    nodeId={selectedNode.id}
                    slots={selectedNode.data.inSlots || []}
                    access="read"
                    availableSlotPaths={availableSlotPaths}
                    onChange={onUpdateInSlotPath}
                    onCommit={onCheckSlots}
                />
                <SkillSlotSection
                    nodeId={selectedNode.id}
                    slots={selectedNode.data.outSlots || []}
                    access="write"
                    availableSlotPaths={availableSlotPaths}
                    onChange={onUpdateOutSlotPath}
                    onCommit={onCheckSlots}
                />
            </div>
        </div>
    );
}

function StateActionsSection({
    selectedNode,
    availableLocations = [],
    valueVariables = [],
    onUpdateStateActions,
}) {
    return (
        <div className="state-actions-container">
            <StateActionsEditor
                actionName="OnEntry"
                actions={selectedNode.data.onEntry}
                availableLocations={availableLocations}
                valueVariables={valueVariables}
                listId={`onentry-locations-${selectedNode.id}`}
                onChange={(assignments) =>
                    onUpdateStateActions(selectedNode.id, "onEntry", assignments)
                }
            />

            <StateActionsEditor
                actionName="OnExit"
                actions={selectedNode.data.onExit}
                availableLocations={availableLocations}
                valueVariables={valueVariables}
                listId={`onexit-locations-${selectedNode.id}`}
                onChange={(assignments) =>
                    onUpdateStateActions(selectedNode.id, "onExit", assignments)
                }
            />
        </div>
    );
}

export {
    CloneReferencesSection,
    ParametersSection,
    SlotsSection,
    StateActionsSection,
};
