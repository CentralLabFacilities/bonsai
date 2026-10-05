import { useId, useMemo, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { CreationDialog } from "./EditorOverlays.jsx";
import { Button, IconButton, Select, TextInput } from "../ui/index.js";

function CreateSlotForm({
                             onClose,
                             onCreate,
                             skillSlotOptions = [],
                         }) {
    const [path, setPath] = useState("");
    const [isInherited, setIsInherited] = useState(false);
    const [selectedSkillNodeId, setSelectedSkillNodeId] = useState("");
    const [linkedSkillSlotId, setLinkedSkillSlotId] = useState("");
    const skillInputRef = useRef(null);
    const titleId = useId();

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
        <CreationDialog
            className="slot-create-modal-overlay"
            labelledBy={titleId}
            initialFocusRef={skillInputRef}
            onCancel={resetAndClose}
        >
            <div className="slot-create-modal">
                <div className="slot-create-modal-header">
                    <h3 id={titleId}>Create New Slot</h3>
                    <IconButton
                        size="sm"
                        variant="danger"
                        className="slot-create-modal-close"
                        aria-label="Cancel slot creation"
                        onClick={resetAndClose}
                    >
                        <FiX aria-hidden="true" />
                    </IconButton>
                </div>

                <form onSubmit={handleSubmit} className="slot-create-modal-form">
                    <label className="slot-create-modal-label">
                        Skill
                        <Select
                            ref={skillInputRef}
                            className="skill-select"
                            value={selectedSkillNodeId}
                            onChange={handleSkillChange}
                            disabled={skillOptions.length === 0}
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
                        </Select>
                    </label>

                    <label className="slot-create-modal-label">
                        Key
                        <Select
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
                        </Select>
                        {linkedSkillSlot && (
                            <span className="slot-create-modal-hint">
                                Type: {linkedSkillSlot.type}
                            </span>
                        )}
                    </label>

                    <label className="slot-create-modal-label">
                        Path
                        <TextInput
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
                        <Button
                            className="menu-button"
                            onClick={resetAndClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            className="menu-button highlight-save-button"
                            disabled={!path.trim() || !linkedSkillSlot}
                        >
                            Create
                        </Button>
                    </div>
                </form>
            </div>
        </CreationDialog>
    );
}

export default function CreateSlotModal({ isOpen, ...props }) {
    return isOpen ? <CreateSlotForm {...props} /> : null;
}
