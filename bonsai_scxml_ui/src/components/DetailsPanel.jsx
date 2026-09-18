import { useMemo, useState } from "react";
import { FiActivity, FiChevronDown, FiDatabase, FiExternalLink, FiLayers, FiLink2 } from "react-icons/fi";
import StateActionsEditor from "./StateActionsEditor";


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

function SlotDetailsPanel({
                              selectedNode,
                              slotDetails,
                              availableSlotPaths = [],
                              onUpdateSlotPath,
                              onUpdateSlotInherited,
                              onSelectSkill,
                              onHoverSkill,
                          }) {
    const initialPath =
        selectedNode.data?.path ||
        selectedNode.data?.label ||
        "";
    const [pathDraft, setPathDraft] = useState(initialPath);

    const slotType =
        slotDetails?.dataType ||
        selectedNode.data?.slotType ||
        "Unknown";
    const accessTypes = slotDetails?.accessTypes || [];
    const skillAccesses = slotDetails?.skillAccesses || [];
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

                <section className="slot-access-section">
                    <div className="slot-section-heading">
                        <div>
                            <div className="slot-section-title">Accessed by</div>
                            <div className="slot-section-subtitle">
                                Skills connected to this slot
                            </div>
                        </div>
                        <span className="slot-access-count">
                            {skillAccesses.length}
                        </span>
                    </div>

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


function getSkillPackageName(fullSkillName) {
    let baseName = String(fullSkillName || "").split("#")[0];

    const skillsMarker = ".skills.";
    const skillsIndex = baseName.indexOf(skillsMarker);

    if (skillsIndex !== -1) {
        baseName = baseName.slice(
            skillsIndex + skillsMarker.length
        );
    }

    const parts = baseName.split(".").filter(Boolean);

    if (parts.length <= 1) {
        return "";
    }

    return parts.slice(0, -1).join(".");
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
                          slotDetails,
                          onUpdateSlotPath,
                          onUpdateSlotInherited,
                          onSelectSlotAccessSkill,
                          onHoverSlotAccessSkill,
                      }) {
    const isSubMachine =
        selectedNode.type === "submachine" ||
        Boolean(selectedNode.data.src);
    const isContainerState =
        selectedNode.type === "compound" ||
        selectedNode.type === "parallel";

    const [openTargetSelector, setOpenTargetSelector] = useState(null);
    const [targetQueries, setTargetQueries] = useState({});

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
            />
        );
    }

    const targetNodeOptions = (availableTargetNodes || []).map((node) => {
        const fullSkillName = node.data?.fullSkillName || "";
        const stateName = fullSkillName.includes("#")
            ? fullSkillName.split("#").pop()
            : "";

        const skillName =
            node.data?.label ||
            fullSkillName.split(".").pop().split("#")[0] ||
            node.id;

        const displayName =
            stateName && stateName !== skillName
                ? `${skillName} (${stateName})`
                : skillName;

        return {
            id: node.id,
            displayName,
            skillName,
            stateName,
            fullSkillName,
            packageName: getSkillPackageName(fullSkillName),
        };
    });

    const getTargetSelectorKey = (event, index) =>
        `${selectedNode.id}:${event.id}:${index}`;

    const getCurrentTargetDisplayName = (event) => {
        if (!event.target) return "";

        const option = targetNodeOptions.find(
            (candidate) => candidate.id === event.target
        );

        return option?.displayName || event.target;
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

    const getMatchingTargetNodes = (query) => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return targetNodeOptions;
        }

        return targetNodeOptions.filter((option) =>
            [
                option.displayName,
                option.skillName,
                option.stateName,
                option.fullSkillName,
                option.packageName,
                option.id,
            ].some((value) =>
                String(value || "")
                    .toLowerCase()
                    .includes(normalizedQuery)
            )
        );
    };

    const selectExistingTarget = (event, index, option) => {
        const key = getTargetSelectorKey(event, index);

        setTargetQueries((previous) => ({
            ...previous,
            [key]: option.displayName,
        }));

        setOpenTargetSelector(null);
        onSetEventTarget?.(event, option.id);
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

        const exactMatch = targetNodeOptions.find((option) =>
            [
                option.displayName,
                option.skillName,
                option.stateName,
                option.fullSkillName,
                option.packageName,
                option.id,
            ].some(
                (value) =>
                    String(value || "").toLowerCase() ===
                    query.toLowerCase()
            )
        );

        if (exactMatch) {
            selectExistingTarget(event, index, exactMatch);
            return;
        }

        const matches = getMatchingTargetNodes(query);

        if (matches.length === 1) {
            selectExistingTarget(event, index, matches[0]);
        }
    };

    // Assignment scopes are intentionally separate:
    // - location: variables writable in the selected state. For a sub-state
    //   machine these are ONLY the child machine's local datamodel entries.
    // - valueVariables: variables readable by the assignment expression. For
    //   a sub-state machine App.jsx supplies the parent workflow datamodel.
    const availableActionLocations = [
        ...(globalDataModel || []).filter((parameter) => parameter?.id),
        ...(!isSubMachine
            ? (selectedNode.data.params || [])
                .filter((parameter) => parameter?.key)
                .map((parameter) => ({
                    ...parameter,
                    id: parameter.key,
                    source: "Parameter",
                }))
            : []),
    ].filter(
        (location, index, locations) =>
            location?.id &&
            locations.findIndex(
                (candidate) => candidate?.id === location.id
            ) === index
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
                        ) : isContainerState ? (
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
                                />
                            </div>
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
                                    {sortExitTokens(
                                        selectedNode.data.events
                                    ).map((event, index) => (
                                            <div
                                                className={`slot-text-field exit-token-card exit-token-${getExitTokenType(
                                                    event.id
                                                )}`}
                                                key={`${event.id}-${index}`}
                                            >
                                                <div className="detail-card-header">
                                                    <span className="detail-card-title">
                                                        {event.id}
                                                    </span>

                                                    <span
                                                        className={`detail-badge exit-token-badge exit-token-badge-${getExitTokenType(
                                                            event.id
                                                        )}`}
                                                    >
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

                                                        const matches =
                                                            getMatchingTargetNodes(
                                                                query
                                                            );

                                                        const isOpen =
                                                            openTargetSelector ===
                                                            selectorKey;

                                                        return (
                                                            <div className="exit-target-selector">
                                                                <div className="exit-target-input-row">
                                                                    <input
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
                                                                                            {option.packageName
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

                {activeTab === "parameter" && !isSubMachine && (
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

                {activeTab === "slots" && !isSubMachine && (
                    <div className="slots-container">
                        <h3>Slots</h3>

                        <div className="slot-list">
                            {(selectedNode.data.inSlots || []).map(
                                (slot, index) => (
                                    <div
                                        className="slot-text-field compact-slot-card compact-slot-read"
                                        key={`in-${slot.key}`}
                                    >
                                        <div className="compact-slot-header">
                                            <div className="compact-slot-name">
                                                {slot.key}
                                            </div>

                                            <div className="compact-slot-badges">
                                                <span
                                                    className={`parameter-type-badge parameter-type-${String(
                                                        slot.type || "other"
                                                    )
                                                        .toLowerCase()
                                                        .replace(
                                                            /[^a-z0-9]+/g,
                                                            "-"
                                                        )}`}
                                                >
                                                    {slot.type || "Unknown"}
                                                </span>

                                                <span className="slot-access-badge slot-access-read">
                                                    Read
                                                </span>
                                            </div>
                                        </div>

                                        {slot.description && (
                                            <div className="parameter-description">
                                                {slot.description}
                                            </div>
                                        )}

                                        <SlotPathEditor
                                            id={`in-slot-${selectedNode.id}-${index}`}
                                            value={slot.path || ""}
                                            slotType={slot.type}
                                            availableSlotPaths={availableSlotPaths}
                                            onChange={(value, commit) =>
                                                onUpdateInSlotPath(
                                                    index,
                                                    value,
                                                    commit
                                                )
                                            }
                                            onCommit={onCheckSlots}
                                        />
                                    </div>
                                )
                            )}

                            {(selectedNode.data.outSlots || []).map(
                                (slot, index) => (
                                    <div
                                        className="slot-text-field compact-slot-card compact-slot-write"
                                        key={`out-${slot.key}`}
                                    >
                                        <div className="compact-slot-header">
                                            <div className="compact-slot-name">
                                                {slot.key}
                                            </div>

                                            <div className="compact-slot-badges">
                                                <span
                                                    className={`parameter-type-badge parameter-type-${String(
                                                        slot.type || "other"
                                                    )
                                                        .toLowerCase()
                                                        .replace(
                                                            /[^a-z0-9]+/g,
                                                            "-"
                                                        )}`}
                                                >
                                                    {slot.type || "Unknown"}
                                                </span>

                                                <span className="slot-access-badge slot-access-write">
                                                    Write
                                                </span>
                                            </div>
                                        </div>

                                        {slot.description && (
                                            <div className="parameter-description">
                                                {slot.description}
                                            </div>
                                        )}

                                        <SlotPathEditor
                                            id={`out-slot-${selectedNode.id}-${index}`}
                                            value={slot.path || ""}
                                            slotType={slot.type}
                                            availableSlotPaths={availableSlotPaths}
                                            onChange={(value, commit) =>
                                                onUpdateOutSlotPath(
                                                    index,
                                                    value,
                                                    commit
                                                )
                                            }
                                            onCommit={onCheckSlots}
                                        />
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "actions" && (
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

export default DetailsPanel;
