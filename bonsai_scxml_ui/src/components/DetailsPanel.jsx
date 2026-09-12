import { FiExternalLink, FiLayers } from "react-icons/fi";
import StateActionsEditor from "./StateActionsEditor";

function MetadataRow({ label, value }) {
    return (
        <div className="metadata-row">
            <span className="metadata-label">{label}</span>
            <span className="metadata-value">
                {value !== undefined && value !== null && value !== ""
                    ? String(value)
                    : "—"}
            </span>
        </div>
    );
}


function formatResourceKeys(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return "—";
    }

    const keys = items
        .map((item) => {
            if (typeof item === "string") return item;
            return item?.key || "";
        })
        .filter(Boolean);

    return keys.length > 0 ? keys.join(", ") : "—";
}

function DetailsPanel({
                          selectedNode,
                          hasInitialNode,
                          activeTab,
                          setActiveTab,
                          packages,
                          getPackageSkillEvent,
                          onSetInitial,
                          onUpdateName,
                          onUpdateEvent,
                          onCreateNodeForEvent,
                          onUpdateParameter,
                          onUpdateInSlotPath,
                          onUpdateOutSlotPath,
                          onCheckSlots,
                          onUpdateSrc,
                          onUpdateParameterBlur,
                          globalDataModel,
                          onUpdateStateActions,
                      }) {
    const isSubMachine =
        selectedNode.type === "submachine" ||
        Boolean(selectedNode.data.src);

    const availableActionLocations = [
        ...(globalDataModel || []).map((parameter) => parameter.id),
        ...(selectedNode.data.params || []).map((parameter) => parameter.key),
    ].filter(
        (location, index, locations) =>
            location && locations.indexOf(location) === index
    );

    return (
        <aside className="details-panel">
            <h3>Details: {selectedNode.data.label}</h3>

            <div className="tabs">
                <div
                    className={`tab ${
                        activeTab === "allgemein" ? "active-tab" : ""
                    }`}
                    onClick={() => setActiveTab("allgemein")}
                >
                    Overall
                </div>

                {!isSubMachine && (
                    <>
                        <div
                            className={`tab ${
                                activeTab === "parameter" ? "active-tab" : ""
                            }`}
                            onClick={() => setActiveTab("parameter")}
                        >
                            Parameter
                        </div>

                        <div
                            className={`tab ${
                                activeTab === "slots" ? "active-tab" : ""
                            }`}
                            onClick={() => setActiveTab("slots")}
                        >
                            Slots
                        </div>
                    </>
                )}

                <div
                    className={`tab ${
                        activeTab === "actions" ? "active-tab" : ""
                    }`}
                    onClick={() => setActiveTab("actions")}
                >
                    Entry / Exit
                </div>
            </div>

            <div className="tab-content">
                {activeTab === "allgemein" && (
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
                                disabled={
                                    hasInitialNode &&
                                    !selectedNode.data.isInitial
                                }
                                onClick={onSetInitial}
                            >
                                Initial set
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
                                                e.target.value
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
                        ) : (
                            <>
                                <div className="field-row">
                                    <span className="field-label">
                                        Package:
                                    </span>

                                    <span className="field-value">
                                        {selectedNode.data.fullSkillName
                                            ?.split(".")[0] || "—"}
                                    </span>
                                </div>

                                <div className="field-row">
                                    <span className="field-label">
                                        Skill:
                                    </span>

                                    <span className="field-value">
                                        {selectedNode.data.label || "—"}
                                    </span>
                                </div>

                                <div className="field-row">
                                    <label className="field-label">
                                        Name:
                                    </label>

                                    <input
                                        className="text-field"
                                        type="text"
                                        value={
                                            selectedNode.data.fullSkillName
                                                ?.split("#")[1] || ""
                                        }
                                        onChange={(e) =>
                                            onUpdateName(e.target.value)
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

                        {!isSubMachine && (
                            <div className="events-container">
                                <h3>Exit Tokens</h3>

                                <div className="event-list">
                                    {(selectedNode.data.events || []).map(
                                        (event, index) => (
                                            <div
                                                className="slot-text-field"
                                                key={`${event.id}-${index}`}
                                            >
                                                <div className="detail-card-header">
                                                    <span className="detail-card-title">
                                                        {event.id}
                                                    </span>

                                                    <span className="detail-badge">
                                                        Exit Token
                                                    </span>
                                                </div>

                                                {event.description && (
                                                    <div className="detail-description">
                                                        {event.description}
                                                    </div>
                                                )}

                                                <div className="editable-field">
                                                    <label className="editable-field-label">
                                                        Target package
                                                    </label>

                                                    <select
                                                        className="skill-select"
                                                        value={
                                                            event.selectedPackage ||
                                                            ""
                                                        }
                                                        onChange={(e) =>
                                                            onUpdateEvent(
                                                                selectedNode.id,
                                                                event.id,
                                                                {
                                                                    selectedPackage:
                                                                    e.target.value,
                                                                    selectedSkill:
                                                                        "",
                                                                }
                                                            )
                                                        }
                                                    >
                                                        <option value="">
                                                            Select package
                                                        </option>

                                                        {packages.map((pkg) => (
                                                            <option
                                                                key={pkg}
                                                                value={pkg}
                                                            >
                                                                {pkg}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="editable-field">
                                                    <label className="editable-field-label">
                                                        Target skill
                                                    </label>

                                                    <select
                                                        className="skill-select"
                                                        value={
                                                            event.selectedSkill ||
                                                            ""
                                                        }
                                                        onChange={(e) =>
                                                            onCreateNodeForEvent(
                                                                event,
                                                                e.target.value
                                                            )
                                                        }
                                                    >
                                                        <option value="">
                                                            Select Skill
                                                        </option>

                                                        {getPackageSkillEvent(
                                                            event.selectedPackage
                                                        ).map((pkg) => {
                                                            const skillName =
                                                                pkg.split(
                                                                    "skills."
                                                                )[1];

                                                            return (
                                                                <option
                                                                    key={pkg}
                                                                    value={
                                                                        skillName
                                                                    }
                                                                >
                                                                    {skillName
                                                                        ?.split(
                                                                            "."
                                                                        )
                                                                        .pop()}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "parameter" && !isSubMachine && (
                    <div className="slots-container">
                        <h3>Parameters</h3>

                        <div className="slot-list">
                            {(selectedNode.data.params || []).map(
                                (param, index) => (
                                    <div
                                        className="slot-text-field"
                                        key={param.key}
                                    >
                                        <div className="detail-card-header">
                                            <span className="detail-card-title">
                                                {param.key}
                                            </span>

                                            <span className="detail-badge">
                                                Parameter
                                            </span>
                                        </div>

                                        {param.description && (
                                            <div className="detail-description">
                                                {param.description}
                                            </div>
                                        )}

                                        <div className="metadata-container">
                                            <MetadataRow
                                                label="Type"
                                                value={param.type}
                                            />

                                            <MetadataRow
                                                label="Required"
                                                value={
                                                    param.required
                                                        ? "Yes"
                                                        : "No"
                                                }
                                            />

                                            <MetadataRow
                                                label="Default"
                                                value={param.default}
                                            />
                                        </div>

                                        <div className="editable-field">
                                            <label
                                                className="editable-field-label"
                                                htmlFor={`param-${selectedNode.id}-${index}`}
                                            >
                                                Value
                                            </label>

                                            <input
                                                id={`param-${selectedNode.id}-${index}`}
                                                className="slot-field-edit"
                                                type="text"
                                                value={param.expr || ""}
                                                placeholder={
                                                    param.default != null
                                                        ? String(param.default)
                                                        : "Enter value"
                                                }
                                                onChange={(e) =>
                                                    onUpdateParameter(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                onBlur={() =>
                                                    onUpdateParameterBlur?.(
                                                        selectedNode.id
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "slots" && !isSubMachine && (
                    <div className="slots-container">
                        <h3>Slots</h3>

                        <div className="slot-list">
                            {(selectedNode.data.inSlots || []).map(
                                (slot, index) => (
                                    <div
                                        className="slot-text-field"
                                        key={`in-${slot.key}`}
                                    >
                                        <div className="detail-card-header">
                                            <span className="detail-card-title">
                                                {slot.key}
                                            </span>

                                            <span className="detail-badge">
                                                Input Slot
                                            </span>
                                        </div>

                                        {slot.description && (
                                            <div className="detail-description">
                                                {slot.description}
                                            </div>
                                        )}

                                        <div className="metadata-container">
                                            <MetadataRow
                                                label="Type"
                                                value={slot.type}
                                            />

                                            <MetadataRow
                                                label="Access"
                                                value="Read"
                                            />
                                        </div>

                                        <div className="editable-field">
                                            <label
                                                className="editable-field-label"
                                                htmlFor={`in-slot-${selectedNode.id}-${index}`}
                                            >
                                                Path
                                            </label>

                                            <input
                                                id={`in-slot-${selectedNode.id}-${index}`}
                                                className="slot-field-edit"
                                                type="text"
                                                value={slot.path || ""}
                                                placeholder="Enter path"
                                                onChange={(e) =>
                                                    onUpdateInSlotPath(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                onBlur={onCheckSlots}
                                            />
                                        </div>
                                    </div>
                                )
                            )}

                            {(selectedNode.data.outSlots || []).map(
                                (slot, index) => (
                                    <div
                                        className="slot-text-field"
                                        key={`out-${slot.key}`}
                                    >
                                        <div className="detail-card-header">
                                            <span className="detail-card-title">
                                                {slot.key}
                                            </span>

                                            <span className="detail-badge">
                                                Output Slot
                                            </span>
                                        </div>

                                        {slot.description && (
                                            <div className="detail-description">
                                                {slot.description}
                                            </div>
                                        )}

                                        <div className="metadata-container">
                                            <MetadataRow
                                                label="Type"
                                                value={slot.type}
                                            />

                                            <MetadataRow
                                                label="Access"
                                                value="Write"
                                            />
                                        </div>

                                        <div className="editable-field">
                                            <label
                                                className="editable-field-label"
                                                htmlFor={`out-slot-${selectedNode.id}-${index}`}
                                            >
                                                Path
                                            </label>

                                            <input
                                                id={`out-slot-${selectedNode.id}-${index}`}
                                                className="slot-field-edit"
                                                type="text"
                                                value={slot.path || ""}
                                                placeholder="Enter path"
                                                onChange={(e) =>
                                                    onUpdateOutSlotPath(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                onBlur={onCheckSlots}
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "actions" && (
                    <div className="state-actions-container">
                        <StateActionsEditor
                            actionName="onentry"
                            actions={selectedNode.data.onEntry}
                            availableLocations={availableActionLocations}
                            listId={`onentry-locations-${selectedNode.id}`}
                            onChange={(assignments) =>
                                onUpdateStateActions(
                                    selectedNode.id,
                                    "onEntry",
                                    assignments
                                )
                            }
                        />

                        <StateActionsEditor
                            actionName="onexit"
                            actions={selectedNode.data.onExit}
                            availableLocations={availableActionLocations}
                            listId={`onexit-locations-${selectedNode.id}`}
                            onChange={(assignments) =>
                                onUpdateStateActions(
                                    selectedNode.id,
                                    "onExit",
                                    assignments
                                )
                            }
                        />
                    </div>
                )}
            </div>
        </aside>
    );
}

export default DetailsPanel;
