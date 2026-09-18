import { useEffect, useMemo, useState } from "react";
import { FiX } from "react-icons/fi";

function CreateSlotModal({
                             isOpen,
                             onClose,
                             onCreate,
                             skillSlotOptions = [],
                         }) {
    const [path, setPath] = useState("");
    const [isInherited, setIsInherited] = useState(false);
    const [selectedSkillNodeId, setSelectedSkillNodeId] = useState("");
    const [linkedSkillSlotId, setLinkedSkillSlotId] = useState("");

    const skillOptions = useMemo(() => {
        const byNode = new Map();

        skillSlotOptions.forEach((option) => {
            if (!option?.nodeId) return;
            if (!byNode.has(option.nodeId)) {
                byNode.set(option.nodeId, {
                    nodeId: option.nodeId,
                    nodeLabel: option.nodeLabel || option.nodeId,
                });
            }
        });

        return [...byNode.values()].sort((a, b) =>
            a.nodeLabel.localeCompare(b.nodeLabel)
        );
    }, [skillSlotOptions]);

    const slotOptionsForSkill = useMemo(
        () =>
            skillSlotOptions
                .filter((option) => option.nodeId === selectedSkillNodeId)
                .sort((a, b) => {
                    const keyCompare = String(a.key || "").localeCompare(
                        String(b.key || "")
                    );
                    if (keyCompare !== 0) return keyCompare;
                    return String(a.access || "").localeCompare(
                        String(b.access || "")
                    );
                }),
        [skillSlotOptions, selectedSkillNodeId]
    );

    const linkedSkillSlot = useMemo(
        () =>
            skillSlotOptions.find(
                (option) => option.id === linkedSkillSlotId
            ) || null,
        [skillSlotOptions, linkedSkillSlotId]
    );

    useEffect(() => {
        if (!isOpen) return;
        setPath("");
        setIsInherited(false);
        setSelectedSkillNodeId("");
        setLinkedSkillSlotId("");
    }, [isOpen]);

    if (!isOpen) return null;

    const resetAndClose = () => {
        setPath("");
        setIsInherited(false);
        setSelectedSkillNodeId("");
        setLinkedSkillSlotId("");
        onClose();
    };

    const handleSkillChange = (event) => {
        setSelectedSkillNodeId(event.target.value);
        setLinkedSkillSlotId("");
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        const cleanPath = path.trim();
        if (!cleanPath || !linkedSkillSlot) return;

        onCreate({
            path: cleanPath,
            type: linkedSkillSlot.type,
            isInherited,
            inheritedFrom: "",
            linkedSkillSlot: {
                nodeId: linkedSkillSlot.nodeId,
                access: linkedSkillSlot.access,
                slotIndex: linkedSkillSlot.slotIndex,
            },
        });

        resetAndClose();
    };

    return (
        <div
            className="slot-create-modal-overlay"
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    resetAndClose();
                }
            }}
        >
            <div
                className="slot-create-modal"
                onClick={(event) => event.stopPropagation()}
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
                    <label className="slot-create-modal-label">
                        Skill
                        <select
                            className="skill-select"
                            value={selectedSkillNodeId}
                            onChange={handleSkillChange}
                            disabled={skillOptions.length === 0}
                            autoFocus
                        >
                            <option value="" disabled>
                                {skillOptions.length > 0
                                    ? "Select a skill"
                                    : "No available skill slots"}
                            </option>
                            {skillOptions.map((option) => (
                                <option
                                    key={option.nodeId}
                                    value={option.nodeId}
                                >
                                    {option.nodeLabel}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="slot-create-modal-label">
                        Key
                        <select
                            className="skill-select"
                            value={linkedSkillSlotId}
                            onChange={(event) =>
                                setLinkedSkillSlotId(event.target.value)
                            }
                            disabled={!selectedSkillNodeId}
                        >
                            <option value="" disabled>
                                {selectedSkillNodeId
                                    ? "Select a key"
                                    : "Select a skill first"}
                            </option>
                            {slotOptionsForSkill.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.key} — {option.access === "read" ? "READ" : "WRITE"}
                                </option>
                            ))}
                        </select>
                        {linkedSkillSlot && (
                            <span className="slot-create-modal-hint">
                                Type: {linkedSkillSlot.type}
                            </span>
                        )}
                    </label>

                    <label className="slot-create-modal-label">
                        Path
                        <input
                            className="text-field"
                            type="text"
                            value={path}
                            placeholder="e.g. A#test or B"
                            onChange={(event) => setPath(event.target.value)}
                        />
                    </label>

                    <label className="slot-create-modal-checkbox-row">
                        <input
                            type="checkbox"
                            checked={isInherited}
                            onChange={(event) =>
                                setIsInherited(event.target.checked)
                            }
                        />
                        Inherited slot
                    </label>

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
                            disabled={!path.trim() || !linkedSkillSlot}
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
