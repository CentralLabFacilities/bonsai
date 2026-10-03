import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
    FiActivity,
    FiArrowDown,
    FiArrowUp,
    FiChevronDown,
    FiDatabase,
    FiExternalLink,
    FiLayers,
    FiLink2,
    FiPlus,
    FiSend,
    FiTrash2,
    FiX,
} from "react-icons/fi";
import StateActionsEditor from "./StateActionsEditor";
import {
    areDetailsPanelPropsEqual,
    createDetailsTargetIndex,
    getAvailableActionLocations,
    getMatchingTargetNodeOptions,
    getSemanticTargetNodeIds as selectSemanticTargetNodeIds,
    getSkillPackageName,
} from "./detailsPanelSelectors.js";


const normalizeSlotPath = (value) =>
    String(value || "")
        .trim()
        .replace(/^\/+/, "")
        .toLowerCase();

const normalizeSlotType = (value) =>
    String(value || "").trim().toLowerCase();

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
        const query = normalizeSlotPath(value);
        const type = normalizeSlotType(slotType);

        return (availableSlotPaths || [])
            .filter((option) => {
                if (!option?.path) return false;
                if (type && normalizeSlotType(option.type) !== type) return false;

                const candidate = normalizeSlotPath(option.path);
                return !query || candidate.includes(query);
            })
            .sort((a, b) => {
                const aPath = normalizeSlotPath(a.path);
                const bPath = normalizeSlotPath(b.path);
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

function NodeReferenceCard({
                               nodeId,
                               name,
                               badge,
                               onNavigate,
                               onHover,
                               hoverFallbackId = null,
                           }) {
    if (!nodeId || !name) return null;

    return (
        <div
            className="slot-text-field compact-slot-card slot-access-skill-card exit-token-node-reference"
            role="button"
            tabIndex={0}
            title={`Open ${name}`}
            onClick={(event) => {
                event.stopPropagation();
                onNavigate?.(nodeId);
            }}
            onMouseEnter={(event) => {
                event.stopPropagation();
                onHover?.(nodeId);
            }}
            onMouseLeave={(event) => {
                event.stopPropagation();
                onHover?.(hoverFallbackId);
            }}
            onFocus={() => onHover?.(nodeId)}
            onBlur={() => onHover?.(hoverFallbackId)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onNavigate?.(nodeId);
                }
            }}
        >
            <div className="compact-slot-header exit-token-node-reference-header">
                <div className="compact-slot-name">{name}</div>
                <div className="compact-slot-badges">
                    {badge && (
                        <span className="slot-access-badge exit-token-node-reference-badge">
                            {badge}
                        </span>
                    )}
                    <FiExternalLink
                        className="slot-access-open-icon"
                        aria-hidden="true"
                    />
                </div>
            </div>
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


const NOP_SEND_EVENT_SUGGESTIONS = ["success", "fatal", "error"];

function NopSendEditor({ nodeId, events = [], onChange }) {
    const eventName = String(
        Array.isArray(events) && events.length > 0 ? events[0] ?? "" : ""
    );
    const [isFocused, setIsFocused] = useState(false);

    const normalizedQuery = eventName.trim().toLowerCase();
    const matchingSuggestions = NOP_SEND_EVENT_SUGGESTIONS.filter((suggestion) =>
        !normalizedQuery || suggestion.includes(normalizedQuery)
    );

    const setEventName = (value) => {
        const nextValue = String(value ?? "");
        onChange?.(nextValue ? [nextValue] : []);
    };

    const handleKeyDown = (event) => {
        if (event.key !== "Enter") return;

        const exactMatch = NOP_SEND_EVENT_SUGGESTIONS.find(
            (suggestion) => suggestion === normalizedQuery
        );
        const onlyMatch = matchingSuggestions.length === 1
            ? matchingSuggestions[0]
            : null;
        const match = exactMatch || onlyMatch;

        if (match && match !== eventName) {
            event.preventDefault();
            setEventName(match);
        }
    };

    return (
        <div className="nop-send-panel">
            <div className="nop-send-hero">
                <div className="nop-send-icon" aria-hidden="true">
                    <FiSend />
                </div>
                <div>
                    <div className="nop-send-eyebrow">Nop action</div>
                    <h3>Send event</h3>
                    <p>
                        A Nop can emit one event when it is reached. Use a standard
                        exit event or enter a custom event name.
                    </p>
                </div>
            </div>

            <div className="nop-send-card">
                <div className="nop-send-card-header">
                    <div>
                        <div className="nop-send-card-title">Outgoing event</div>
                        <div className="nop-send-card-subtitle">
                            Event sent to the parent state machine
                        </div>
                    </div>
                    <div className={`nop-send-status ${eventName.trim() ? "configured" : "empty"}`}>
                        {eventName.trim() ? "Configured" : "Not configured"}
                    </div>
                </div>

                <label className="nop-send-field-label" htmlFor={`nop-send-event-${nodeId}`}>
                    Event
                </label>

                <div className="nop-send-input-wrap">
                    <input
                        id={`nop-send-event-${nodeId}`}
                        className="nop-send-input"
                        type="text"
                        autoComplete="off"
                        spellCheck="false"
                        value={eventName}
                        placeholder="e.g. success or my.custom.event"
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => {
                            window.setTimeout(() => setIsFocused(false), 100);
                        }}
                        onChange={(event) => setEventName(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    {eventName && (
                        <button
                            type="button"
                            className="nop-send-clear"
                            title="Clear event"
                            aria-label="Clear event"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setEventName("")}
                        >
                            <FiX />
                        </button>
                    )}

                    {isFocused && matchingSuggestions.length > 0 && (
                        <div className="nop-send-suggestions">
                            {matchingSuggestions.map((suggestion) => (
                                <button
                                    type="button"
                                    key={suggestion}
                                    className={`nop-send-suggestion ${
                                        suggestion === normalizedQuery ? "selected" : ""
                                    }`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                        setEventName(suggestion);
                                        setIsFocused(false);
                                    }}
                                >
                                    <span>{suggestion}</span>
                                    <span className="nop-send-suggestion-kind">standard</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="nop-send-presets">
                    <span>Common events</span>
                    <div className="nop-send-preset-list">
                        {NOP_SEND_EVENT_SUGGESTIONS.map((suggestion) => (
                            <button
                                type="button"
                                key={suggestion}
                                className={`nop-send-preset ${
                                    suggestion === normalizedQuery ? "active" : ""
                                }`}
                                onClick={() => setEventName(suggestion)}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}


function getExitTokenType(eventId) {
    const mainType = String(eventId || "")
        .trim()
        .toLowerCase()
        .split(".")[0];

    if (mainType === "success") return "success";
    if (mainType === "error") return "error";
    if (mainType === "fatal") return "fatal";

    return "other";
}


function sortExitTokens(events) {
    const priority = {
        success: 0,
        error: 1,
        fatal: 2,
        other: 3,
    };

    return (events || [])
        .map((event, index) => ({
            event,
            index,
            priority:
                priority[getExitTokenType(event.id)] ??
                priority.other,
        }))
        .sort(
            (a, b) =>
                a.priority - b.priority ||
                a.index - b.index
        )
        .map(({ event }) => event);
}

function getEditableExitTokens(events, includeImplicitFatal = false) {
    const editable = (events || []).filter(
        (event) => !(event?.sourceNodeId && event?.transitionHandleId)
    );

    // `fatal` is implicit only for normal executable skills. Sub-state
    // machines expose exactly the exits declared by their referenced behavior.
    if (
        includeImplicitFatal &&
        !editable.some((event) => String(event?.id || "").trim() === "fatal")
    ) {
        editable.push({ id: "fatal", description: "" });
    }

    return sortExitTokens(editable);
}


function ParallelLaneRow({
                             lane,
                             index,
                             laneCount,
                             onRename,
                             onMove,
                             onDelete,
                         }) {
    const laneLabel = String(lane?.data?.label || `Lane_${index + 1}`);
    const [nameDraft, setNameDraft] = useState(laneLabel);

    useEffect(() => {
        // External lane renames reset the draft; typing alone must not reset it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNameDraft(laneLabel);
    }, [lane.id, laneLabel]);

    const commitName = () => {
        const nextName = String(nameDraft || "").trim();
        onRename?.(lane.id, nextName);
    };

    const childCount = Number(lane?.childCount || 0);

    return (
        <div className="parallel-lane-editor-card">
            <div className="parallel-lane-editor-index" aria-hidden="true">
                {index + 1}
            </div>

            <div className="parallel-lane-editor-main">
                <div className="parallel-lane-editor-label-row">
                    <span className="parallel-lane-editor-label">Lane name</span>
                    <span className="parallel-lane-editor-meta">
                        {childCount === 1 ? "1 state" : `${childCount} states`}
                    </span>
                </div>

                <input
                    className="parallel-lane-editor-input"
                    type="text"
                    value={nameDraft}
                    placeholder={`Lane_${index + 1}`}
                    spellCheck="false"
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            setNameDraft(laneLabel);
                            event.currentTarget.blur();
                        }
                    }}
                />
            </div>

            <div className="parallel-lane-editor-actions">
                <button
                    type="button"
                    className="parallel-lane-editor-action"
                    title="Move lane up"
                    aria-label={`Move ${laneLabel} up`}
                    disabled={index === 0}
                    onClick={() => onMove?.(lane.id, "up")}
                >
                    <FiArrowUp size={14} />
                </button>
                <button
                    type="button"
                    className="parallel-lane-editor-action"
                    title="Move lane down"
                    aria-label={`Move ${laneLabel} down`}
                    disabled={index >= laneCount - 1}
                    onClick={() => onMove?.(lane.id, "down")}
                >
                    <FiArrowDown size={14} />
                </button>
                <button
                    type="button"
                    className="parallel-lane-editor-action parallel-lane-editor-delete"
                    title={laneCount <= 1 ? "A parallel needs at least one lane" : "Delete lane and its contents"}
                    aria-label={`Delete ${laneLabel}`}
                    disabled={laneCount <= 1}
                    onClick={() => onDelete?.(lane.id)}
                >
                    <FiTrash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function ParallelLaneEditor({
                                lanes = [],
                                onAdd,
                                onRename,
                                onMove,
                                onDelete,
                            }) {
    return (
        <section className="parallel-lane-editor">
            <div className="parallel-lane-editor-header">
                <div>
                    <div className="parallel-lane-editor-title-row">
                        <h3>Lanes</h3>
                        <span className="parallel-lane-count-badge">{lanes.length}</span>
                    </div>
                    <p>
                        Rename and arrange the parallel branches. Reordering a lane keeps its states with it.
                    </p>
                </div>

                <button
                    type="button"
                    className="parallel-lane-add-button"
                    onClick={() => onAdd?.()}
                >
                    <FiPlus size={14} />
                    Add lane
                </button>
            </div>

            <div className="parallel-lane-editor-list">
                {lanes.map((lane, index) => (
                    <ParallelLaneRow
                        key={lane.id}
                        lane={lane}
                        index={index}
                        laneCount={lanes.length}
                        onRename={onRename}
                        onMove={onMove}
                        onDelete={onDelete}
                    />
                ))}

                {lanes.length === 0 && (
                    <div className="parallel-lane-editor-empty">
                        This parallel has no lanes yet. Add one to create its first branch.
                    </div>
                )}
            </div>
        </section>
    );
}

function DetailsPanel({
                          selectedNode,
                          hasInitialNode,
                          activeTab,
                          setActiveTab,
                          onSetInitial,
                          onUpdateName,
                          onUpdateNameCommit,
                          availableTargetNodes = [],
                          onSetEventTarget,
                          onUpdateParameter,
                          onUpdateInSlotPath,
                          onUpdateOutSlotPath,
                          onCheckSlots,
                          availableSlotPaths = [],
                          onUpdateSrc,
                          onUpdateParameterBlur,
                          globalDataModel,
                          actionValueVariables,
                          onUpdateStateActions,
                          onUpdateSendEvents,
                          slotDetails,
                          onUpdateSlotPath,
                          onUpdateSlotInherited,
                          onSelectSlotAccessSkill,
                          onHoverSlotAccessSkill,
                          onNavigateAncestorSlot,
                          onNavigateDescendantSlotSkill,
                          parameterFocusRequest,
                          slotFocusRequest,
                          transitionFocusRequest,
                          cloneSourceNode,
                          onNavigateCloneSource,
                          cloneNodes = [],
                          onNavigateClone,
                          containerOutgoingTransitions = [],
                          skillOutgoingTransitions = [],
                          onNavigateTransitionNode,
                          onHoverTransitionNode,
                          onOpenTransitionPanel,
                          parallelLanes = [],
                          onAddParallelLane,
                          onRenameParallelLane,
                          onMoveParallelLane,
                          onDeleteParallelLane,
                      }) {
    const isSubMachine =
        selectedNode.type === "submachine" ||
        Boolean(selectedNode.data.src);
    const isSkillClone = Boolean(selectedNode.data?.isSkillClone);
    const isStateClone = Boolean(selectedNode.data?.isStateClone);
    const isEditorClone = isSkillClone || isStateClone;
    const selectedReferenceId = isEditorClone
        ? String(selectedNode.data?.editorInstanceId || selectedNode.id || "").trim()
        : "";
    const hasClones = Array.isArray(cloneNodes) && cloneNodes.length > 0;
    const isContainerState =
        selectedNode.type === "compound" ||
        selectedNode.type === "parallel";
    const selectedSkillType = String(selectedNode.data?.fullSkillName || "")
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();
    const exposesImplicitFatal =
        selectedNode.type === "custom" &&
        !["fatal", "end"].includes(selectedSkillType) &&
        !selectedNode.data?.isFinal &&
        !selectedNode.data?.isBehaviorExit;
    const isNopSkill = !isSubMachine && selectedSkillType === "nop";
    const hasNopSend =
        isNopSkill &&
        Array.isArray(selectedNode.data?.behaviorExitEvents) &&
        String(selectedNode.data.behaviorExitEvents[0] || "").trim().length > 0;
    const editableExitTokens = useMemo(
        () => getEditableExitTokens(selectedNode.data.events || [], exposesImplicitFatal),
        [selectedNode.data.events, exposesImplicitFatal]
    );
    const firstEditableExitToken = editableExitTokens[0] || null;
    const transitionButtonSourceId = selectedNode.id;
    const transitionButtonEventId = isContainerState
        ? ""
        : firstEditableExitToken?.id || null;
    const canOpenTransitionPanel =
        isContainerState ||
        Boolean(transitionButtonSourceId && transitionButtonEventId);
    const usesEditorInstanceId =
        !isSubMachine &&
        ["nop", "fatal", "end"].includes(selectedSkillType);
    const skillDisplayName = String(selectedNode.data?.fullSkillName || "")
        .split("#")[0]
        .split(".")
        .pop() || selectedNode.data?.label || "—";
    const hidesParameterAndSlots =
        !isSubMachine &&
        ["nop", "fatal", "end"].includes(selectedSkillType);
    const hidesEntryExit =
        !isSubMachine &&
        (selectedSkillType === "fatal" ||
            selectedSkillType === "end" ||
            (isNopSkill && hasNopSend));

    const [openTargetSelector, setOpenTargetSelector] = useState(null);
    const [targetQueries, setTargetQueries] = useState({});

    const handledParameterFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!parameterFocusRequest) return;
        if (activeTab !== "parameter") return;
        if (selectedNode.id !== parameterFocusRequest.nodeId) return;
        if (
            handledParameterFocusRequestRef.current ===
            parameterFocusRequest.requestId
        ) {
            return;
        }

        const parameterIndex = (selectedNode.data?.params || []).findIndex(
            (parameter) =>
                String(parameter?.key || "") ===
                String(parameterFocusRequest.parameterKey || "")
        );

        if (parameterIndex < 0) return;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(
                    `param-${selectedNode.id}-${parameterIndex}`
                );

                if (!input) return;

                handledParameterFocusRequestRef.current =
                    parameterFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        parameterFocusRequest,
        selectedNode.id,
        selectedNode.data?.params,
    ]);

    const handledSlotFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!slotFocusRequest) return;
        if (activeTab !== "slots") return;
        if (selectedNode.id !== slotFocusRequest.nodeId) return;
        if (
            handledSlotFocusRequestRef.current ===
            slotFocusRequest.requestId
        ) {
            return;
        }

        const slots =
            slotFocusRequest.access === "write"
                ? selectedNode.data?.outSlots || []
                : selectedNode.data?.inSlots || [];
        const slotIndex = slots.findIndex(
            (slot) =>
                String(slot?.key || "") ===
                String(slotFocusRequest.slotKey || "")
        );

        if (slotIndex < 0) return;

        const inputId = `${
            slotFocusRequest.access === "write" ? "out" : "in"
        }-slot-${selectedNode.id}-${slotIndex}`;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(inputId);
                if (!input) return;

                handledSlotFocusRequestRef.current =
                    slotFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        slotFocusRequest,
        selectedNode.id,
        selectedNode.data?.inSlots,
        selectedNode.data?.outSlots,
    ]);

    const handledTransitionFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!transitionFocusRequest) return;
        if (activeTab !== "allgemein") return;
        if (selectedNode.id !== transitionFocusRequest.nodeId) return;
        if (
            handledTransitionFocusRequestRef.current ===
            transitionFocusRequest.requestId
        ) {
            return;
        }

        const eventIndex = editableExitTokens.findIndex(
            (event) =>
                String(event?.id || "") ===
                String(transitionFocusRequest.eventId || "")
        );

        if (eventIndex < 0) return;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(
                    `transition-target-${selectedNode.id}-${eventIndex}`
                );
                if (!input) return;

                handledTransitionFocusRequestRef.current =
                    transitionFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        transitionFocusRequest,
        selectedNode.id,
        editableExitTokens,
    ]);

    useEffect(() => {
        const hiddenStandardTab =
            (hidesParameterAndSlots || isEditorClone || isSubMachine) &&
            (activeTab === "parameter" || activeTab === "slots");
        const invalidSendTab =
            activeTab === "send" && (!isNopSkill || isEditorClone);
        const hiddenActionsTab =
            activeTab === "actions" && (hidesEntryExit || isEditorClone);
        const invalidClonesTab = activeTab === "clones" && !hasClones;

        if (
            hiddenStandardTab ||
            invalidSendTab ||
            hiddenActionsTab ||
            invalidClonesTab
        ) {
            setActiveTab("allgemein");
        }
    }, [
        activeTab,
        hasClones,
        hidesParameterAndSlots,
        hidesEntryExit,
        isNopSkill,
        isEditorClone,
        isSubMachine,
        selectedNode.id,
        setActiveTab,
    ]);

    const hasStateDetails = selectedNode.type !== "slot" && !isEditorClone;
    const targetNodeIndex = useMemo(
        () => hasStateDetails
            ? createDetailsTargetIndex(availableTargetNodes, skillOutgoingTransitions, selectedNode.id)
            : null,
        [hasStateDetails, availableTargetNodes, skillOutgoingTransitions, selectedNode.id]
    );
    // Child datamodel entries are writable in a sub-machine; parent values remain read-only.
    const availableActionLocations = useMemo(
        () => hasStateDetails
            ? getAvailableActionLocations(globalDataModel, selectedNode.data.params, isSubMachine)
            : [],
        [hasStateDetails, globalDataModel, selectedNode.data.params, isSubMachine]
    );

    if (selectedNode.type === "slot") {
        return (
            <SlotDetailsPanel
                key={selectedNode.id}
                selectedNode={selectedNode}
                slotDetails={slotDetails}
                availableSlotPaths={availableSlotPaths}
                onUpdateSlotPath={onUpdateSlotPath}
                onUpdateSlotInherited={onUpdateSlotInherited}
                onSelectSkill={onSelectSlotAccessSkill}
                onHoverSkill={onHoverSlotAccessSkill}
                onNavigateAncestorSlot={onNavigateAncestorSlot}
                onNavigateDescendantSkill={onNavigateDescendantSlotSkill}
            />
        );
    }

    if (isEditorClone) {
        const sourceIdentity = cloneSourceNode
            ? String(
                cloneSourceNode.data?.fullSkillName ||
                cloneSourceNode.data?.label ||
                cloneSourceNode.id
            )
                .split(".")
                .pop()
            : "Original state not found";

        return (
            <aside className="details-panel">
                <h3>Details: {selectedNode.data?.label || "State Reference"}</h3>

                <div className="tabs">
                    <div className="tab active-tab">Overall</div>
                </div>

                <div className="tab-content">
                    <div className="allgemein-container">
                        <div className="description-header">
                            <h3>{isSkillClone ? "Skill Reference" : "State Reference"}</h3>
                        </div>

                        <div className="skill-clone-detail-card">
                            <div className="detail-card-title">Reference target</div>
                            <MetadataRow
                                label="Reference ID"
                                value={selectedReferenceId || "—"}
                            />
                            <button
                                type="button"
                                className="skill-clone-source-button"
                                disabled={!cloneSourceNode}
                                onClick={() =>
                                    cloneSourceNode &&
                                    onNavigateCloneSource?.(cloneSourceNode.id)
                                }
                                title={
                                    cloneSourceNode
                                        ? "Go to the original state"
                                        : "The original state no longer exists"
                                }
                            >
                                {sourceIdentity}
                            </button>
                            <div className="detail-description">
                                This is an editor-only inbound reference. Incoming
                                transitions target the original state in SCXML;
                                outgoing transitions remain on the original node.
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        );
    }

    const getSemanticTargetNodeIds = (event) => selectSemanticTargetNodeIds(event, targetNodeIndex);

    const resolveEventTargetNodeId = (event) =>
        getSemanticTargetNodeIds(event)[0] || null;

    const transitionButtonTargetId =
        !isContainerState && firstEditableExitToken
            ? resolveEventTargetNodeId(firstEditableExitToken)
            : null;

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

        if (
            Object.prototype.hasOwnProperty.call(
                targetQueries,
                key
            )
        ) {
            return targetQueries[key];
        }

        return getCurrentTargetDisplayName(event);
    };

    const getMatchingTargetNodes = (query) => getMatchingTargetNodeOptions(query, targetNodeIndex);

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

    const handleTargetKeyDown = (
        keyboardEvent,
        event,
        index
    ) => {
        if (keyboardEvent.key !== "Enter") {
            return;
        }

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

                {hasClones && (
                    <div
                        className={`tab ${
                            activeTab === "clones" ? "active-tab" : ""
                        }`}
                        onClick={() => setActiveTab("clones")}
                    >
                        References
                    </div>
                )}

                {!isSubMachine && !hidesParameterAndSlots && (
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

                {isNopSkill && (
                    <div
                        className={`tab ${
                            activeTab === "send" ? "active-tab" : ""
                        }`}
                        onClick={() => setActiveTab("send")}
                    >
                        Send
                    </div>
                )}

                {!hidesEntryExit && (
                    <div
                        className={`tab ${
                            activeTab === "actions" ? "active-tab" : ""
                        }`}
                        onClick={() => setActiveTab("actions")}
                    >
                        Entry / Exit
                    </div>
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
                )}

                {activeTab === "clones" && hasClones && (
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
                )}

                {activeTab === "parameter" && !isSubMachine && !hidesParameterAndSlots && (
                    <div className="slots-container">
                        <h3>Parameters</h3>

                        <div className="slot-list">
                            {(selectedNode.data.params || []).map(
                                (param, index) => (
                                    <div
                                        className="slot-text-field parameter-card"
                                        key={param.key}
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
                                                        .replace(
                                                            /[^a-z0-9]+/g,
                                                            "-"
                                                        )}`}
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

                                        <input
                                            id={`param-${selectedNode.id}-${index}`}
                                            className="parameter-value-input"
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
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                            onBlur={() =>
                                                onUpdateParameterBlur?.(
                                                    selectedNode.id
                                                )
                                            }
                                        />
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "slots" && !isSubMachine && !hidesParameterAndSlots && (
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
                )}

                {activeTab === "send" && isNopSkill && (
                    <NopSendEditor
                        nodeId={selectedNode.id}
                        events={selectedNode.data.behaviorExitEvents || []}
                        onChange={(events) =>
                            onUpdateSendEvents?.(selectedNode.id, events)
                        }
                    />
                )}

                {activeTab === "actions" && !hidesEntryExit && (
                    <div className="state-actions-container">
                        <StateActionsEditor
                            actionName="OnEntry"
                            actions={selectedNode.data.onEntry}
                            availableLocations={availableActionLocations}
                            valueVariables={actionValueVariables || globalDataModel || []}
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
                            actionName="OnExit"
                            actions={selectedNode.data.onExit}
                            availableLocations={availableActionLocations}
                            valueVariables={actionValueVariables || globalDataModel || []}
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

export default memo(DetailsPanel, areDetailsPanelPropsEqual);
