import { useState, useMemo } from "react";
import { FiX } from "react-icons/fi";

const SLOT_TYPE_OPTIONS = [
    "StringSlot",
    "IntegerSlot",
    "DoubleSlot",
    "BooleanSlot",
    "PoseSlot",
    "PoseListSlot",
    "ObjectShapeListSlot",
];

function CreateSlotModal({ isOpen, onClose, onCreate, availableStates = [], skillSlotOptions = [] }) {
    const [path, setPath] = useState("");
    const [type, setType] = useState(SLOT_TYPE_OPTIONS[0]);
    const [isInherited, setIsInherited] = useState(false);
    const [inheritedFrom, setInheritedFrom] = useState("");
    const [selectedSkillNodeId, setSelectedSkillNodeId] = useState("");
    const [linkedSkillSlotId, setLinkedSkillSlotId] = useState("");

    const hasStateOptions = availableStates.length > 0;
    const hasSkillOptions = skillSlotOptions.length > 0;

    const skillOptions = useMemo(() => {
            const byNode = new Map();

            skillSlotOptions.forEach((option) => {
                if (!byNode.has(option.nodeId)) {
                    byNode.set(option.nodeId, {
                        nodeId: option.nodeId,
                        nodeLabel: option.nodeLabel,
                    });
                }
            });

            return [...byNode.values()];
        }, [skillSlotOptions]);

        const slotOptionsForSkill = useMemo(
            () =>
                skillSlotOptions.filter(
                    (option) => option.nodeId === selectedSkillNodeId
                ),
            [skillSlotOptions, selectedSkillNodeId]
        );


         const linkedSkillSlot =
             skillSlotOptions.find((option) => option.id === linkedSkillSlotId) ||
             null;
        const typeOptions =
            linkedSkillSlot?.type && !SLOT_TYPE_OPTIONS.includes(linkedSkillSlot.type)
                ? [...SLOT_TYPE_OPTIONS, linkedSkillSlot.type]
                : SLOT_TYPE_OPTIONS;

    if (!isOpen) return null;

    const resetAndClose = () => {
        setPath("");
        setType(SLOT_TYPE_OPTIONS[0]);
        setIsInherited(false);
        setInheritedFrom("");
        setSelectedSkillNodeId("");
        setLinkedSkillSlotId("");
        onClose();
    };

    const handleSkillChange = (e) => {
            setSelectedSkillNodeId(e.target.value);
            setLinkedSkillSlotId("");
        };

        const handleSkillSlotChange = (e) => {
            const id = e.target.value;
            setLinkedSkillSlotId(id);

            const option = skillSlotOptions.find((opt) => opt.id === id);
            if (!option) return;

            setType(option.type || SLOT_TYPE_OPTIONS[0]);
            if (!path.trim()) {
                setPath((option.key || "").toLowerCase());
            }
        };

    const handleSubmit = (e) => {
        e.preventDefault();
        const cleanPath = path.trim();
        if (!cleanPath) return;

        onCreate({
            path: cleanPath,
            type,
            isInherited,
            inheritedFrom: isInherited ? inheritedFrom.trim() : "",
            linkedSkillSlot: linkedSkillSlot
                            ? {
                                nodeId: linkedSkillSlot.nodeId,
                                access: linkedSkillSlot.access,
                                slotIndex: linkedSkillSlot.slotIndex,
                            }
                            : null,
        });

        resetAndClose();
    };

    return (
        <div className="slot-create-modal-overlay" onClick= {(e) => {if (e.target === e.currentTarget) {resetAndClose();} }}>
            <div
                className="slot-create-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="slot-create-modal-header">
                    <h3>Create New Slot</h3>
                    <button
                        type="button"
                        className="slot-create-modal-close"
                        onClick={resetAndClose}
                    >
                        <FiX />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="slot-create-modal-form">
                    {hasSkillOptions && (
                                            <>
                                                <label className="slot-create-modal-label">
                                                    Skill (optional)
                                                    <select
                                                        className="skill-select"
                                                        value={selectedSkillNodeId}
                                                        onChange={handleSkillChange}
                                                    >
                                                        <option value="">— Create manually —</option>
                                                        {skillOptions.map((option) => (
                                                            <option key={option.nodeId} value={option.nodeId}>
                                                                {option.nodeLabel}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                {selectedSkillNodeId && (
                                                    <label className="slot-create-modal-label">
                                                        Slot
                                                        <select
                                                            className="skill-select"
                                                            value={linkedSkillSlotId}
                                                            onChange={handleSkillSlotChange}
                                                        >
                                                            <option value="" disabled>
                                                                Select a slot
                                                            </option>
                                                            {slotOptionsForSkill.map((option) => (
                                                                <option key={option.id} value={option.id}>
                                                                    {option.access === "read" ? "READ" : "WRITE"}{" "}
                                                                    {option.key} ({option.type})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                )}
                                            </>
                                        )}
                    <label className="slot-create-modal-label">
                        Path
                        <input
                            className="text-field"
                            type="text"
                            value={path}
                            placeholder="e.g. A#test or B"
                            onChange={(e) => setPath(e.target.value)}
                            autoFocus
                        />
                    </label>

                    <label className="slot-create-modal-label">
                        Type
                        <select
                            className="skill-select"
                            value={type}
                            disabled={Boolean(linkedSkillSlot)}
                            onChange={(e) => setType(e.target.value)}
                        >
                            {typeOptions.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                        {linkedSkillSlot && (
                                                    <span className="slot-create-modal-hint">
                                                        Locked to {linkedSkillSlot.nodeLabel}'s slot type so it can connect.
                                                    </span>
                                                )}
                    </label>

                    <label className="slot-create-modal-checkbox-row">
                        <input
                            type="checkbox"
                            checked={isInherited}
                            onChange={(e) => {
                                      setIsInherited(e.target.checked);
                                      setInheritedFrom("");
                                      }}
                        />
                        Inherited slot (inheritSlot)
                    </label>

                    {isInherited && (
                        <label className="slot-create-modal-label">
                            Inherited from
                            {hasStateOptions ? (
                                         <select
                                                   className="skill-select"
                                                   value={inheritedFrom}
                                                   onChange={(e) => setInheritedFrom(e.target.value)}
                                                >
                                                   <option value="" disabled>
                                                        Select a state
                                                    </option>
                                                   {availableStates.map((state) => (
                                                       <option key={state} value={state}>
                                                             {state}
                                                       </option>
                                                    ))}
                                                     </select>
                                            ) : (
                                                <input
                                                    className="text-field"
                                                    type="text"
                                                    value={inheritedFrom}
                                                    placeholder="e.g. slots.SlotIO"
                                                    onChange={(e) => setInheritedFrom(e.target.value)}
                                                />
                                             )}
                        </label>
                    )}

                    <div className="slot-create-modal-footer">
                        <button
                            type="button"
                            className="menu-button"
                            onClick={resetAndClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="menu-button highlight-save-button"
                            disabled={!path.trim() || (isInherited && hasStateOptions && !inheritedFrom)}
                        >
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default CreateSlotModal;