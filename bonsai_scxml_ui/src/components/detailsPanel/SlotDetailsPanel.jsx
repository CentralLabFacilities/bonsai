import { useMemo, useState } from "react";
import { FiActivity, FiChevronDown, FiDatabase, FiExternalLink, FiLayers, FiLink2 } from "react-icons/fi";
import { MetadataRow } from "./DetailsPanelPrimitives.jsx";
import { normalizeSlotPath, normalizeSlotType } from "../../utils/editorGraph.js";

const normalizeSlotSearchPath = (value) =>
    normalizeSlotPath(value).toLowerCase();

function SlotPathEditor({
                            id,
                            value,
                            slotType,
                            availableSlotPaths = [],
                            onChange,
                            onCommit,
                        }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const matches = useMemo(() => {
        const query = normalizeSlotSearchPath(value);
        const type = normalizeSlotType(slotType);

        return (availableSlotPaths || [])
            .filter((option) => {
                if (!option?.path) return false;
                if (type && normalizeSlotType(option.type) !== type) return false;

                const candidate = normalizeSlotSearchPath(option.path);
                return !query || candidate.includes(query);
            })
            .sort((a, b) => {
                const aPath = normalizeSlotSearchPath(a.path);
                const bPath = normalizeSlotSearchPath(b.path);
                const aStarts = !query || aPath.startsWith(query) ? 0 : 1;
                const bStarts = !query || bPath.startsWith(query) ? 0 : 1;

                return (
                    aStarts - bStarts ||
                    String(a.path).localeCompare(String(b.path))
                );
            });
    }, [availableSlotPaths, slotType, value]);

    const selectMatch = (path) => {
        onChange(path, true);
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (event) => {
        if (event.key === "ArrowDown") {
            if (matches.length === 0) return;
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) =>
                current < matches.length - 1 ? current + 1 : 0
            );
            return;
        }

        if (event.key === "ArrowUp") {
            if (matches.length === 0) return;
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) =>
                current > 0 ? current - 1 : matches.length - 1
            );
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();

            if (isOpen && matches.length > 0 && activeIndex >= 0) {
                selectMatch(matches[activeIndex].path);
                return;
            }

            // No matching existing path was selected. Keeping the typed path
            // makes it a new slot when the slot graph is rebuilt on blur.
            event.currentTarget.blur();
            return;
        }

        if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
        }
    };

    return (
        <div className="typed-value-editor">
            <div className="typed-value-editor-row">
                <input
                    id={id}
                    className="parameter-value-input compact-slot-path-input"
                    type="text"
                    value={value || ""}
                    placeholder="Enter or select path"
                    autoComplete="off"
                    onChange={(event) => {
                        onChange(event.target.value, false);
                        setIsOpen(true);
                        setActiveIndex(-1);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setActiveIndex(-1);
                    }}
                    onBlur={() => {
                        setIsOpen(false);
                        setActiveIndex(-1);
                        onCommit?.();
                    }}
                    onKeyDown={handleKeyDown}
                />

                {isOpen && matches.length > 0 && (
                    <div className="typed-value-autocomplete">
                        {matches.map((option, index) => (
                            <button
                                key={`${option.path}-${option.type || ""}`}
                                type="button"
                                className={`typed-value-autocomplete-option ${
                                    index === activeIndex ? "active" : ""
                                }`}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectMatch(option.path);
                                }}
                            >
                                <span className="typed-value-autocomplete-value">
                                    {option.path}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function SkillSlotSection({
                             nodeId,
                             slots,
                             access,
                             availableSlotPaths,
                             onChange,
                             onCommit,
                         }) {
    const prefix = access === "read" ? "in" : "out";

    return slots.map((slot, index) => (
        <div
            className={`slot-text-field compact-slot-card compact-slot-${access}`}
            key={`${prefix}-${slot.key}`}
        >
            <div className="compact-slot-header">
                <div className="compact-slot-name">{slot.key}</div>
                <div className="compact-slot-badges">
                    <span
                        className={`parameter-type-badge parameter-type-${String(slot.type || "other")
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")}`}
                    >
                        {slot.type || "Unknown"}
                    </span>
                    <span className={`slot-access-badge slot-access-${access}`}>
                        {access === "read" ? "Read" : "Write"}
                    </span>
                </div>
            </div>

            {slot.description && (
                <div className="parameter-description">{slot.description}</div>
            )}

            <SlotPathEditor
                id={`${prefix}-slot-${nodeId}-${index}`}
                value={slot.path || ""}
                slotType={slot.type}
                availableSlotPaths={availableSlotPaths}
                onChange={(value, commit) => onChange(index, value, commit)}
                onCommit={onCommit}
            />
        </div>
    ));
}

function SlotDetailsPanel({
                              selectedNode,
                              slotDetails,
                              availableSlotPaths = [],
                              onUpdateSlotPath,
                              onUpdateSlotInherited,
                              onSelectSkill,
                              onHoverSkill,
                              onNavigateAncestorSlot,
                              onNavigateDescendantSkill,
                          }) {
    const initialPath =
        selectedNode.data?.path ||
        selectedNode.data?.label ||
        "";
    const [pathDraft, setPathDraft] = useState(initialPath);
    const [sourceHierarchyExpanded, setSourceHierarchyExpanded] = useState(true);
    const [accessedByExpanded, setAccessedByExpanded] = useState(true);

    const slotType =
        slotDetails?.dataType ||
        selectedNode.data?.slotType ||
        "Unknown";
    const accessTypes = slotDetails?.accessTypes || [];
    const skillAccesses = slotDetails?.skillAccesses || [];
    const ancestorSlotAccesses = slotDetails?.ancestorSlotAccesses || [];
    const descendantSkillAccesses = slotDetails?.descendantSkillAccesses || [];
    const childSlotAccesses = slotDetails?.childSlotAccesses || [];
    const parentSourceHierarchyEntries = ancestorSlotAccesses;
    const nestedSourceHierarchyEntries = [
        ...descendantSkillAccesses,
        ...childSlotAccesses,
    ];
    const sourceHierarchyEntries = [
        ...parentSourceHierarchyEntries,
        ...nestedSourceHierarchyEntries,
    ];
    const nestedSourceHierarchyGroups = (() => {
        const groups = new Map();

        nestedSourceHierarchyEntries.forEach((access) => {
            const hierarchy = Array.isArray(access?.subMachinePath)
                ? access.subMachinePath.filter(Boolean)
                : [];
            const fallbackLabel = access?.childLabel || "Sub-state machine";
            const hierarchyLabel =
                hierarchy.length > 0
                    ? hierarchy.join(" › ")
                    : fallbackLabel;

            if (!groups.has(hierarchyLabel)) {
                groups.set(hierarchyLabel, {
                    label: hierarchyLabel,
                    entries: [],
                });
            }
            groups.get(hierarchyLabel).entries.push(access);
        });

        return [...groups.values()];
    })();
    const hasSourceHierarchy = sourceHierarchyEntries.length > 0;
    const isInherited = Boolean(
        slotDetails?.isInherited ??
        selectedNode.data?.currentMachineInherited
    );

    const commitPath = (nextValue = pathDraft) => {
        const cleanPath = String(nextValue || "").trim();
        if (!cleanPath) {
            setPathDraft(initialPath);
            return;
        }
        onUpdateSlotPath?.(cleanPath);
    };

    return (
        <aside className="details-panel slot-details-panel">
            <div className="slot-details-heading">
                <div>
                    <div className="slot-details-kicker">Slot</div>
                    <h3>Slot Details</h3>
                </div>

                <label
                    className={`slot-inherit-control ${isInherited ? "is-active" : ""}`}
                    title="Mark this slot as inheritSlot in the current state machine"
                >
                    <div className="slot-inherit-copy">
                        <span className="slot-inherit-title">inheritSlot</span>
                        <span className="slot-inherit-subtitle">
                            {isInherited
                                ? "Inherited from the parent state machine"
                                : "Local to this state machine"}
                        </span>
                    </div>
                    <input
                        className="slot-inherit-checkbox"
                        type="checkbox"
                        checked={isInherited}
                        onChange={(event) =>
                            onUpdateSlotInherited?.(event.target.checked)
                        }
                    />
                    <span className="slot-inherit-switch" aria-hidden="true">
                        <span className="slot-inherit-switch-knob" />
                    </span>
                </label>
            </div>

            <div className="tab-content slot-details-content">
                <section className="slot-overview-card">
                    <div className="slot-detail-field-label">
                        <FiLink2 />
                        <span>Path</span>
                    </div>
                    <div className="slot-path-editor-shell">
                        <SlotPathEditor
                            id={`slot-detail-path-${selectedNode.id}`}
                            value={pathDraft}
                            slotType={slotType}
                            availableSlotPaths={availableSlotPaths}
                            onChange={(value, commit) => {
                                setPathDraft(value);
                                if (commit) {
                                    commitPath(value);
                                }
                            }}
                            onCommit={() => commitPath(pathDraft)}
                        />
                    </div>

                    <div className="slot-summary-grid">
                        <div className="slot-summary-item">
                            <div className="slot-summary-label">
                                <FiDatabase />
                                <span>Data type</span>
                            </div>
                            <div className="slot-summary-value">
                                <span
                                    className={`parameter-type-badge parameter-type-${String(
                                        slotType || "other"
                                    )
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "-")}`}
                                >
                                    {slotType}
                                </span>
                            </div>
                        </div>

                        <div className="slot-summary-item">
                            <div className="slot-summary-label">
                                <FiActivity />
                                <span>Access</span>
                            </div>
                            <div className="slot-summary-value slot-summary-accesses">
                                {accessTypes.length > 0 ? (
                                    accessTypes.map((access) => (
                                        <span
                                            key={access}
                                            className={`slot-access-badge slot-access-${access}`}
                                        >
                                            {access === "read" ? "Read" : "Write"}
                                        </span>
                                    ))
                                ) : (
                                    <span className="slot-summary-empty">None</span>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {(isInherited || hasSourceHierarchy) && (
                    <section className="slot-access-section slot-source-hierarchy-section">
                        <div className="slot-section-heading slot-section-heading-collapsible">
                            <button
                                type="button"
                                className="slot-section-toggle"
                                aria-expanded={sourceHierarchyExpanded}
                                onClick={() =>
                                    setSourceHierarchyExpanded((expanded) => !expanded)
                                }
                            >
                                <FiChevronDown
                                    className={`slot-section-chevron ${
                                        sourceHierarchyExpanded ? "" : "is-collapsed"
                                    }`}
                                    aria-hidden="true"
                                />
                                <div>
                                    <div className="slot-section-title">Source hierarchy</div>
                                    <div className="slot-section-subtitle">
                                        Slot sources above this state machine and consumers in nested sub-state machines
                                    </div>
                                </div>
                            </button>
                            <span className="slot-access-count">
                                {sourceHierarchyEntries.length}
                            </span>
                        </div>

                        {sourceHierarchyExpanded && (
                            <div className="slot-source-hierarchy-list">
                            {parentSourceHierarchyEntries.length > 0 && (
                                <div className="slot-hierarchy-group">
                                    <div className="slot-hierarchy-group-heading">
                                        <div>
                                            <div className="slot-hierarchy-group-title">
                                                Parent state machines
                                            </div>
                                            <div className="slot-hierarchy-group-subtitle">
                                                Sources inherited from machines above the current state machine
                                            </div>
                                        </div>
                                        <span className="slot-hierarchy-group-count">
                                            {parentSourceHierarchyEntries.length}
                                        </span>
                                    </div>

                                    <div className="slot-list slot-access-list slot-hierarchy-group-list">
                                        {parentSourceHierarchyEntries.map((access, index) => {
                                            const isInheritanceHop =
                                                access.hierarchyKind === "inherit" ||
                                                access.access === "inherit";

                                            return (
                                                <div
                                                    className={`slot-text-field compact-slot-card ${
                                                        isInheritanceHop
                                                            ? "compact-slot-read"
                                                            : "compact-slot-write"
                                                    } slot-access-skill-card`}
                                                    key={`ancestor-${access.parentTabId}-${access.nodeId || "slot"}-${access.key}-${index}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    title={`Open ${access.parentMachineName}`}
                                                    onClick={() =>
                                                        onNavigateAncestorSlot?.(
                                                            access.parentTabId,
                                                            access.nodeId || null
                                                        )
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key === "Enter" ||
                                                            event.key === " "
                                                        ) {
                                                            event.preventDefault();
                                                            onNavigateAncestorSlot?.(
                                                                access.parentTabId,
                                                                access.nodeId || null
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <div className="compact-slot-header">
                                                        <div className="compact-slot-name">
                                                            {access.parentMachineName}
                                                        </div>
                                                        <div className="compact-slot-badges">
                                                            <span
                                                                className={`slot-access-badge ${
                                                                    isInheritanceHop
                                                                        ? "slot-access-read"
                                                                        : "slot-access-write"
                                                                }`}
                                                            >
                                                                {isInheritanceHop
                                                                    ? "inheritSlot"
                                                                    : "Write"}
                                                            </span>
                                                            <FiExternalLink aria-hidden="true" />
                                                        </div>
                                                    </div>

                                                    <MetadataRow
                                                        label={isInheritanceHop ? "Path" : "Skill"}
                                                        value={
                                                            isInheritanceHop
                                                                ? access.path
                                                                : access.skillName
                                                        }
                                                    />
                                                    {!isInheritanceHop && (
                                                        <MetadataRow label="Key" value={access.key} />
                                                    )}
                                                    <MetadataRow label="Type" value={access.type} />
                                                    {access.description && (
                                                        <MetadataRow
                                                            label="Description"
                                                            value={access.description}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {nestedSourceHierarchyGroups.length > 0 && (
                                <div className="slot-hierarchy-group">
                                    <div className="slot-hierarchy-group-heading">
                                        <div>
                                            <div className="slot-hierarchy-group-title">
                                                Nested sub-state machines
                                            </div>
                                            <div className="slot-hierarchy-group-subtitle">
                                                Skills below the current state machine that consume this slot
                                            </div>
                                        </div>
                                        <span className="slot-hierarchy-group-count">
                                            {nestedSourceHierarchyEntries.length}
                                        </span>
                                    </div>

                                    <div className="slot-hierarchy-nested-groups">
                                        {nestedSourceHierarchyGroups.map((group, groupIndex) => (
                                            <div
                                                className="slot-hierarchy-machine-group"
                                                key={`${group.label}-${groupIndex}`}
                                            >
                                                <div className="slot-hierarchy-machine-heading">
                                                    <FiLayers aria-hidden="true" />
                                                    <span>{group.label}</span>
                                                    <span className="slot-hierarchy-machine-count">
                                                        {group.entries.length}
                                                    </span>
                                                </div>

                                                <div className="slot-list slot-access-list slot-hierarchy-group-list">
                                                    {group.entries.map((access, index) => {
                                                        const isDescendantSkillAccess =
                                                            access.sourceKind === "descendant-skill";
                                                        const isChildAccess = Boolean(access.childLabel);

                                                        if (isDescendantSkillAccess) {
                                                            const accessLabel =
                                                                access.access === "read"
                                                                    ? "Read"
                                                                    : access.access === "write"
                                                                        ? "Write"
                                                                        : "Inherit";

                                                            return (
                                                                <div
                                                                    className={`slot-text-field compact-slot-card compact-slot-${
                                                                        access.access === "write"
                                                                            ? "write"
                                                                            : "read"
                                                                    } slot-access-skill-card`}
                                                                    key={`descendant-skill-${access.childNodeId || "child"}-${access.nodeId || access.skillName}-${access.key}-${index}`}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    title={`Open ${access.skillName} in ${group.label}`}
                                                                    onClick={() =>
                                                                        onNavigateDescendantSkill?.(access)
                                                                    }
                                                                    onKeyDown={(event) => {
                                                                        if (
                                                                            event.key === "Enter" ||
                                                                            event.key === " "
                                                                        ) {
                                                                            event.preventDefault();
                                                                            onNavigateDescendantSkill?.(access);
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="compact-slot-header">
                                                                        <div className="compact-slot-name">
                                                                            {access.skillName}
                                                                        </div>
                                                                        <div className="compact-slot-badges">
                                                                            <span
                                                                                className={`slot-access-badge ${
                                                                                    access.access === "write"
                                                                                        ? "slot-access-write"
                                                                                        : "slot-access-read"
                                                                                }`}
                                                                            >
                                                                                {accessLabel}
                                                                            </span>
                                                                            <span className="slot-access-badge">
                                                                                Sub-SM
                                                                            </span>
                                                                            <FiExternalLink
                                                                                className="slot-access-open-icon"
                                                                                aria-hidden="true"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <MetadataRow
                                                                        label="Slot"
                                                                        value={access.key || access.slotPath}
                                                                    />
                                                                    <MetadataRow
                                                                        label="Type"
                                                                        value={access.type}
                                                                    />
                                                                    {access.description && (
                                                                        <MetadataRow
                                                                            label="Description"
                                                                            value={access.description}
                                                                        />
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        if (isChildAccess) {
                                                            return (
                                                                <div
                                                                    className="slot-text-field compact-slot-card compact-slot-read slot-access-skill-card"
                                                                    key={`source-child-${access.childNodeId}-${index}`}
                                                                >
                                                                    <div className="compact-slot-header">
                                                                        <div className="compact-slot-name">
                                                                            {access.childLabel}
                                                                        </div>
                                                                        <span className="slot-access-badge">
                                                                            inherit
                                                                        </span>
                                                                    </div>
                                                                    <MetadataRow
                                                                        label="Slot"
                                                                        value={
                                                                            access.slotKey ||
                                                                            access.slotPath
                                                                        }
                                                                    />
                                                                </div>
                                                            );
                                                        }

                                                        return null;
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {sourceHierarchyEntries.length === 0 && (
                                <div className="slot-access-empty-state">
                                    <FiLayers />
                                    <span>
                                        No inherited source or sub-state-machine consumer was found for this slot.
                                    </span>
                                </div>
                            )}
                            </div>
                        )}
                    </section>
                )}

                <section className="slot-access-section">
                    <div className="slot-section-heading slot-section-heading-collapsible">
                        <button
                            type="button"
                            className="slot-section-toggle"
                            aria-expanded={accessedByExpanded}
                            onClick={() => setAccessedByExpanded((expanded) => !expanded)}
                        >
                            <FiChevronDown
                                className={`slot-section-chevron ${
                                    accessedByExpanded ? "" : "is-collapsed"
                                }`}
                                aria-hidden="true"
                            />
                            <div>
                                <div className="slot-section-title">Accessed by</div>
                                <div className="slot-section-subtitle">
                                    Skills connected to this slot
                                </div>
                            </div>
                        </button>
                        <span className="slot-access-count">
                            {skillAccesses.length}
                        </span>
                    </div>

                    {accessedByExpanded && (
                        <div className="slot-list slot-access-list">
                        {skillAccesses.length > 0 ? (
                            skillAccesses.map((access, index) => (
                                <div
                                    className={`slot-text-field compact-slot-card compact-slot-${access.access} slot-access-skill-card`}
                                    key={`${access.nodeId}-${access.access}-${access.key}-${index}`}
                                    role="button"
                                    tabIndex={0}
                                    title={`Open ${access.skillName}`}
                                    onClick={() => onSelectSkill?.(access.nodeId)}
                                    onMouseEnter={() => onHoverSkill?.(access.nodeId)}
                                    onMouseLeave={() => onHoverSkill?.(null)}
                                    onFocus={() => onHoverSkill?.(access.nodeId)}
                                    onBlur={() => onHoverSkill?.(null)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            onSelectSkill?.(access.nodeId);
                                        }
                                    }}
                                >
                                    <div className="compact-slot-header">
                                        <div className="compact-slot-name">
                                            {access.skillName}
                                        </div>
                                        <div className="compact-slot-badges">
                                            <span
                                                className={`slot-access-badge slot-access-${access.access}`}
                                            >
                                                {access.access === "read" ? "Read" : "Write"}
                                            </span>
                                            <FiExternalLink className="slot-access-open-icon" />
                                        </div>
                                    </div>
                                    <MetadataRow label="Key" value={access.key} />
                                    <MetadataRow label="Type" value={access.type} />
                                    {access.description && (
                                        <MetadataRow
                                            label="Description"
                                            value={access.description}
                                        />
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="slot-access-empty-state">
                                <FiLayers />
                                <span>No skill currently accesses this slot.</span>
                            </div>
                        )}
                        </div>
                    )}
                </section>
            </div>
        </aside>
    );
}


export { SkillSlotSection };
export default SlotDetailsPanel;
