import { FiExternalLink, FiLayers } from "react-icons/fi";

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
    onUpdateSrc, // Optional: Pfad editieren
}) {
    const isSubMachine = selectedNode.type === "submachine" || Boolean(selectedNode.data.src);

    return (
        <aside className="details-panel">
            <h3>Details: {selectedNode.data.label}</h3>
            <div className="tabs">
                <div className={`tab ${activeTab === "allgemein" ? "active-tab" : ""}`} onClick={() => setActiveTab("allgemein")}>
                    Overall
                </div>
                {!isSubMachine && (
                    <>
                        <div className={`tab ${activeTab === "parameter" ? "active-tab" : ""}`} onClick={() => setActiveTab("parameter")}>
                            Parameter
                        </div>
                        <div className={`tab ${activeTab === "slots" ? "active-tab" : ""}`} onClick={() => setActiveTab("slots")}>
                            Slots
                        </div>
                    </>
                )}
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
                            <h3>{isSubMachine ? "Sub-Machine View" : "General View"}</h3>
                            <button className="initial-button" disabled={hasInitialNode && !selectedNode.data.isInitial} onClick={onSetInitial}>
                                Initial set
                            </button>
                        </div>

                        {isSubMachine ? (
                            <>
                                <div className="field-row">
                                    <label className="field-label">Typ:</label>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#c084fc", fontWeight: "bold", fontSize: "13px" }}>
                                        <FiLayers /> Sub-State-Machine
                                    </div>
                                </div>
                                <div className="field-row">
                                    <label className="field-label">State ID:</label>
                                    <input
                                        className="text-field"
                                        type="text"
                                        value={selectedNode.data.label}
                                        onChange={(e) => onUpdateName(e.target.value)}
                                    />
                                </div>
                                <div className="field-row">
                                    <label className="field-label">Source (src):</label>
                                    <input
                                        className="text-field"
                                        type="text"
                                        value={selectedNode.data.src || ""}
                                        placeholder="${EXERCISE}/..."
                                        onChange={(e) => onUpdateSrc && onUpdateSrc(selectedNode.id, e.target.value)}
                                    />
                                </div>
                                <button
                                    className="menu-button"
                                    style={{ marginTop: "6px", width: "100%", justifyContent: "center" }}
                                    onClick={() => selectedNode.data.onOpenSubMachine && selectedNode.data.onOpenSubMachine(selectedNode.data.src, selectedNode.data.label)}
                                >
                                    <FiExternalLink /> Open in a new tab
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="field-row">
                                    <label className="field-label">Package:</label>
                                    <input className="text-field" type="text" value={selectedNode.data.fullSkillName?.split(".")[0] || ""} readOnly />
                                </div>
                                <div className="field-row">
                                    <label className="field-label">Skill:</label>
                                    <input className="text-field" type="text" value={selectedNode.data.label} readOnly />
                                </div>
                                <div className="field-row">
                                    <label className="field-label">Name:</label>
                                    <input
                                        className="text-field"
                                        type="text"
                                        value={selectedNode.data.fullSkillName?.split("#")[1] || ""}
                                        onChange={(e) => onUpdateName(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        <div className="events-container">
                            <h3>Events:</h3>
                            <div className="event-list">
                                {(selectedNode.data.events || []).map((event) => (
                                    <div className="event-text-field" key={event.id}>
                                        {event.id} →
                                        <select
                                            className="skill-select"
                                            value={event.selectedPackage || ""}
                                            onChange={(e) => onUpdateEvent(selectedNode.id, event.id, { selectedPackage: e.target.value, selectedSkill: "" })}
                                        >
                                            <option value="">Select package</option>
                                            {packages.map((pkg) => (
                                                <option key={pkg} value={pkg}>{pkg}</option>
                                            ))}
                                        </select>

                                        <select
                                            className="skill-select"
                                            value={event.selectedSkill || ""}
                                            onChange={(e) => onCreateNodeForEvent(event, e.target.value)}
                                        >
                                            <option value="">Select Skill</option>
                                            {getPackageSkillEvent(event.selectedPackage).map((pkg) => {
                                                const skillName = pkg.split("skills.")[1];
                                                return <option key={pkg} value={skillName}>{skillName.split(".").pop()}</option>;
                                            })}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "parameter" && !isSubMachine && (
                    <div className="slots-container">
                        <h3>Parameters of the selected skill</h3>
                        <div className="slot-list">
                            {(selectedNode.data.params || []).map((param, index) => (
                                <div className="slot-text-field" key={param.key}>
                                    <h4>{param.key}</h4>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`Type: ${param.type}`} readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`required: ${param.required}`} readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`default: ${param.default}`} readOnly /></div>
                                    <div className="slot-row">
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            value={param.expr || ""}
                                            placeholder={param.default != null ? String(param.default) : ""}
                                            onChange={(e) => onUpdateParameter(index, e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === "slots" && !isSubMachine && (
                    <div className="slots-container">
                        <h3>Slots of the selected skill</h3>
                        <div className="slot-list">
                            {(selectedNode.data.inSlots || []).map((slot, index) => (
                                <div className="slot-text-field" key={slot.key}>
                                    <h4>{slot.key}</h4>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value="Read / Write: Read" readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`Type: ${slot.type}`} readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`Slot: ${slot.slotKind || ""}`} readOnly /></div>
                                    <div className="slot-row">
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            value={slot.path || ""}
                                            placeholder="Enter path"
                                            onChange={(e) => onUpdateInSlotPath(index, e.target.value)}
                                            onBlur={onCheckSlots}
                                        />
                                    </div>
                                </div>
                            ))}
                            {(selectedNode.data.outSlots || []).map((slot, index) => (
                                <div className="slot-text-field" key={slot.key}>
                                    <h4>{slot.key}</h4>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value="Read / Write: Write" readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`Type: ${slot.type}`} readOnly /></div>
                                    <div className="slot-row"><input className="slot-field-readonly" type="text" value={`Slot: ${slot.slotKind || ""}`} readOnly /></div>
                                    <div className="slot-row">
                                        <input
                                            className="slot-field-edit"
                                            type="text"
                                            value={slot.path || ""}
                                            placeholder="Enter path"
                                            onChange={(e) => onUpdateOutSlotPath(index, e.target.value)}
                                            onBlur={onCheckSlots}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

export default DetailsPanel;