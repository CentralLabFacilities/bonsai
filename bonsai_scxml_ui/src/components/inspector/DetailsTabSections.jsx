import { FiLink2 } from "react-icons/fi";
import StateActionsEditor from "../inputs/StateActionsEditor.jsx";
import TypedValueEditor from "../inputs/TypedValueEditor.jsx";
import { SkillSlotSection } from "./SlotDetailsPanel.jsx";
import { NodeReferenceCard } from "./DetailsPanelPrimitives.jsx";
import { InlineFeedback } from "../ui/index.js";

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
    getParameterEditSource,
    onUpdateParameter,
}) {
    return (
        <div className="slots-container">
            <h3>Parameters</h3>

            <div className="slot-list">
                {(selectedNode.data.params || []).map((param, index) => (
                    <div
                        className="slot-text-field parameter-card"
                        key={JSON.stringify([selectedNode.id, selectedNode.type, selectedNode.data.fullSkillName,
                            selectedNode.data.src, selectedNode.data.isSkillClone, selectedNode.data.isStateClone,
                            selectedNode.data.cloneOfNodeId, selectedNode.data.scxmlStateId, param.key])}
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
                            value={param.expr ?? ""}
                            sourceIdentity={param}
                            getCommitContext={() => getParameterEditSource?.(selectedNode.id, param.key)}
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
                            onCommit={(value, source, inputValue) =>
                                onUpdateParameter(index, value, true, source ? { ...source, inputValue } : source)
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
                />
                <SkillSlotSection
                    nodeId={selectedNode.id}
                    slots={selectedNode.data.outSlots || []}
                    access="write"
                    availableSlotPaths={availableSlotPaths}
                    onChange={onUpdateOutSlotPath}
                />
            </div>
        </div>
    );
}

function SubMachineSlotsSection({ selectedNode, onNavigateDescendantSkill }) {
    const slots = selectedNode.data.inheritedSlots;
    const childLabel = selectedNode.data.label || selectedNode.data.fullSkillName || "Sub-state machine";
    return (
        <div className="slots-container">
            <h3>Child Slot Requirements</h3>
            <div className="detail-description">
                These slot requirements are fixed by the child state machine.
            </div>

            {!Array.isArray(slots) ? (
                <InlineFeedback compact title="Child slot metadata unavailable">
                    Open the child state machine to inspect its inheritSlot requirements.
                    No loaded metadata is available; this does not mean the child has no requirements.
                </InlineFeedback>
            ) : slots.length === 0 ? (
                <InlineFeedback compact>No inherited slot requirements are declared by this child.</InlineFeedback>
            ) : (
                <div className="slot-list">
                    {slots.map((slot, index) => {
                        const access = slot.access;
                        const resolvedAccess = access === "read" || access === "write";
                        const skills = Array.isArray(slot.skillAccesses) ? slot.skillAccesses : [];
                        const references = new Map();
                        for (const skill of skills) {
                            const name = String(skill.skillName || "").trim();
                            if (!name) continue;
                            const skillAccess = skill.access || access || "inherit";
                            const hierarchy = Array.isArray(skill.subMachinePath) ? skill.subMachinePath
                                : Array.isArray(slot.subMachinePath) ? slot.subMachinePath : [];
                            const reference = { ...skill, nodeId: skill.skillNodeId || skill.nodeId || null,
                                skillName: name, access: skillAccess, key: skill.key || slot.key || "",
                                slotPath: slot.path || slot.xpath || "", type: skill.type || slot.type || "Unknown",
                                childNodeId: selectedNode.id, childLabel, subMachinePath: [childLabel, ...hierarchy].filter(Boolean),
                                sourceKind: "descendant-skill", hierarchyKind: "descendant" };
                            const key = JSON.stringify([reference.nodeId || name, skillAccess, reference.key, hierarchy]);
                            if (!references.has(key)) references.set(key, reference);
                        }
                        const descriptions = slot.description ? [slot.description]
                            : [...new Set(skills.map((skill) => skill.description).filter(Boolean))];
                        return (
                            <section
                                key={`${selectedNode.id}:${index}:${slot.path}`}
                                className={`slot-text-field compact-slot-card${resolvedAccess ? ` compact-slot-${access}` : ""}`}
                                aria-label={`Child slot requirement ${slot.key || slot.path || index + 1}`}
                            >
                                <div className="compact-slot-header">
                                    <div className="compact-slot-name" title={slot.path || slot.xpath}>{slot.key || slot.path || "inheritSlot"}</div>
                                    <div className="compact-slot-badges">
                                        <span className={`parameter-type-badge parameter-type-${String(slot.type || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                                            {slot.type || "Unknown"}
                                        </span>
                                        <span className={`slot-access-badge${resolvedAccess ? ` slot-access-${access}` : ""}`}>
                                            {resolvedAccess ? access === "read" ? "Read" : "Write" : "Access unresolved"}
                                        </span>
                                    </div>
                                </div>
                                {references.size > 0 ? (
                                    <div className="slot-list slot-access-list">
                                        {[...references].map(([key, reference]) => (
                                            <NodeReferenceCard
                                                key={key}
                                                nodeId={reference.nodeId || reference.skillName}
                                                name={reference.skillName}
                                                badge={reference.access === "read" ? "Read" : reference.access === "write" ? "Write" : "Inherit"}
                                                className={`slot-text-field compact-slot-card slot-access-skill-card${reference.access === "read" || reference.access === "write" ? ` compact-slot-${reference.access}` : ""}`}
                                                badgeClassName={`slot-access-badge${reference.access === "read" || reference.access === "write" ? ` slot-access-${reference.access}` : ""}`}
                                                onNavigate={() => onNavigateDescendantSkill?.(reference)}
                                            />
                                        ))}
                                    </div>
                                ) : <div className="detail-description">Skill not resolved</div>}
                                {descriptions.map((description) => (
                                    <div className="parameter-description" key={description}>{description}</div>
                                ))}
                            </section>
                        );
                    })}
                </div>
            )}
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
    SubMachineSlotsSection,
    StateActionsSection,
};
