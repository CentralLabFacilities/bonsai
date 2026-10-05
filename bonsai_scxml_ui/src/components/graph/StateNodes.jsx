import { useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { FiExternalLink, FiLink2 } from "react-icons/fi";
import {
    IncomingTransitionHandle,
    NodeTitle,
    NodeWarning,
    StateActionBadges,
} from "./NodeChrome.jsx";
import { estimateSlotDockWidth, estimateSummaryWidth } from "../../utils/layoutUtils.js";
import { getSlotHandleDragClass, getStateSlotEntries } from "../../utils/slotVisuals.js";

const textValue = (value) => String(value ?? "").trim();
const REFERENCE_TYPES = { submachine: "SUB-SM", compound: "COMPOUND", parallel: "PARALLEL" };

function editHandlers(onActivate) {
    return {
        role: "button",
        tabIndex: 0,
        onMouseDown: (event) => event.stopPropagation(),
        onClick: (event) => {
            event.stopPropagation();
            onActivate();
        },
        onKeyDown: (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onActivate();
        },
    };
}

function useNodeHandleLayout(id, signature) {
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
        const frame = requestAnimationFrame(() => updateNodeInternals(id));
        return () => cancelAnimationFrame(frame);
    }, [id, signature, updateNodeInternals]);
}

function getParameterEntries(data) {
    const runtimeByKey = new Map();
    for (const [key, value] of Object.entries(data.runtimeParameterValues || {})) {
        const normalized = key.trim();
        if (!runtimeByKey.has(normalized)) runtimeByKey.set(normalized, value);
    }
    return (data.params || [])
        .filter((parameter) => String(parameter?.key || "").trim())
        .map((parameter) => {
            const key = String(parameter.key);
            const value = textValue(parameter.expr);
            const defaultValue = textValue(parameter.default);
            const runtimeValueMeta = runtimeByKey.get(key.trim()) || null;
            const hasRuntimeValue = Boolean(runtimeValueMeta);
            return {
                key,
                value,
                defaultValue,
                runtimeValueMeta,
                hasRuntimeValue,
                configuredDisplayValue: value || defaultValue,
                displayValue: hasRuntimeValue
                    ? runtimeValueMeta.value === ""
                        ? '""'
                        : String(runtimeValueMeta.value)
                    : value || defaultValue,
                usesDefault: !hasRuntimeValue && value === "" && defaultValue !== "",
            };
        });
}

function getSkillWarning(data, { showEvents, showSlots, terminal }) {
    const missingSlots =
        showSlots &&
        [...(data.inSlots || []), ...(data.outSlots || [])].some(
            (slot) => !slot.path || String(slot.path).trim() === "",
        );
    const missingParams = (data.params || []).some(
        (parameter) =>
            parameter.required && !textValue(parameter.expr) && !textValue(parameter.default),
    );
    // Validation consumes the per-node projection, never the entire edge store.
    const outgoing = new Set(data.outgoingTransitionHandles || []);
    const missingTransitions =
        showEvents &&
        !terminal &&
        !outgoing.has("*") &&
        (data.events || []).some((event) => event.id !== "*" && !outgoing.has(event.id));
    const unexposed = (data.unexposedTransitionHandles || []).filter(Boolean);
    return [
        missingSlots && "Not every slot has a path",
        missingParams && "Required parameters are missing",
        missingTransitions && "Not every transition is set",
        unexposed.length > 0 &&
            `Transition uses unexposed exit token${unexposed.length === 1 ? "" : "s"}: ${unexposed.join(", ")}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function EventPorts({ id, data, eventIds, editable }) {
    return (
        <div className="event-list">
            {eventIds.map((eventId) => (
                <div className="event-row" key={eventId}>
                    <span
                        className={`event-name ${editable ? "nodrag nopan" : ""}`}
                        {...(editable
                            ? editHandlers(() => data.onOpenTransition?.(id, eventId))
                            : {})}
                        title={editable ? `${eventId} \u2014 click to edit transition` : undefined}
                        style={editable ? { cursor: "pointer" } : undefined}
                    >
                        {eventId}
                    </span>
                    <Handle
                        id={eventId}
                        type="source"
                        position={Position.Right}
                        className="source-handle"
                        isConnectableStart={true}
                        isConnectableEnd={false}
                    />
                </div>
            ))}
        </div>
    );
}

function ValueSummary({ id, data, entries, local }) {
    return (
        <div
            className={local ? "submachine-datamodel-summary" : "node-parameter-summary"}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                padding: local ? "6px 10px 6px" : "6px 10px 4px",
            }}
        >
            {local && (
                <div
                    style={{
                        fontSize: "9px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.45px",
                        color: "#7e22ce",
                        marginBottom: "1px",
                    }}
                >
                    Local Data
                </div>
            )}
            {entries.map((entry) => {
                const value = entry.displayValue;
                const title = local
                    ? value
                        ? `${entry.key} = ${value}`
                        : entry.key
                    : entry.hasRuntimeValue
                      ? `${entry.key} = ${value} (runtime${entry.runtimeValueMeta?.timestamp ? ` at ${entry.runtimeValueMeta.timestamp}` : ""})${entry.configuredDisplayValue ? ` \u00b7 configured: ${entry.configuredDisplayValue}` : ""}`
                      : `${entry.key}${value ? ` = ${value}${entry.usesDefault ? " (default)" : ""}` : ""} \u2014 click to edit`;
                return (
                    <div
                        key={entry.key}
                        className={
                            local
                                ? undefined
                                : `node-parameter-row nodrag nopan ${entry.hasRuntimeValue ? "node-parameter-row-runtime" : ""}`
                        }
                        {...(local
                            ? {}
                            : editHandlers(() => data.onOpenParameter?.(id, entry.key)))}
                        title={title}
                        style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: "6px",
                            minWidth: 0,
                            fontSize: "10px",
                            lineHeight: 1.35,
                            ...(local ? {} : { cursor: "pointer" }),
                        }}
                    >
                        <span
                            className={local ? undefined : "node-parameter-key"}
                            style={{
                                fontWeight: 700,
                                color: local ? "#6b21a8" : "#475569",
                                overflowWrap: "anywhere",
                            }}
                        >
                            {entry.key}
                        </span>
                        {value && (
                            <>
                                <span
                                    aria-hidden="true"
                                    style={{ color: local ? "#a78bfa" : "#94a3b8" }}
                                >
                                    =
                                </span>
                                <span
                                    className={
                                        local
                                            ? undefined
                                            : `node-parameter-value ${entry.usesDefault ? "node-parameter-default-value" : ""} ${entry.hasRuntimeValue ? "node-parameter-runtime-value" : ""}`
                                    }
                                    style={{
                                        color: local
                                            ? "#3b0764"
                                            : entry.hasRuntimeValue
                                              ? "#1d4ed8"
                                              : entry.usesDefault
                                                ? "#94a3b8"
                                                : "#0f172a",
                                        fontFamily: "Consolas, Monaco, 'Courier New', monospace",
                                        ...(local
                                            ? {}
                                            : {
                                                  fontStyle: entry.usesDefault
                                                      ? "italic"
                                                      : "normal",
                                              }),
                                        overflowWrap: "anywhere",
                                        minWidth: 0,
                                    }}
                                >
                                    {value}
                                </span>
                                {entry.hasRuntimeValue && (
                                    <span className="node-parameter-runtime-badge">runtime</span>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function SlotDock({ id, data, entries, submachine }) {
    return (
        <>
            <div className="skill-slot-access-guide" aria-hidden="true">
                <div className="skill-slot-access skill-slot-access-write">
                    <span className="skill-slot-access-dot" />
                    <span>Write</span>
                </div>
                <div className="skill-slot-access skill-slot-access-read">
                    <span className="skill-slot-access-dot" />
                    <span>Read</span>
                </div>
            </div>
            <div
                className={`node-slot-summary ${entries.length >= 3 ? "node-slot-summary-slanted" : "node-slot-summary-horizontal"}`}
            >
                <div className="skill-slot-border-rail" aria-hidden="true">
                    {entries.map((entry) => (
                        <span
                            key={entry.handleId}
                            className={`skill-slot-border-segment skill-slot-border-segment-${entry.access}`}
                        />
                    ))}
                </div>
                <div className="node-slot-ports">
                    {entries.map((entry) => {
                        const label = submachine
                            ? String(entry.key || entry.path || "Slot")
                            : entry.key;
                        const access = entry.access === "read" ? "Read" : "Write";
                        const dragClass = getSlotHandleDragClass({
                            drag: data.slotConnectionDrag,
                            nodeId: id,
                            handleId: entry.handleId,
                            access: entry.access,
                            origin: submachine ? "submachine" : "skill",
                            slotType: entry.type,
                        });
                        return (
                            <div
                                key={entry.handleId}
                                className={`node-slot-row node-slot-row-${entry.access}`}
                            >
                                <span
                                    className={`node-slot-entry ${entry.inherited ? "node-slot-entry-inherited" : ""} ${submachine ? "" : "nodrag nopan"}`}
                                    {...(submachine
                                        ? {}
                                        : editHandlers(() =>
                                              data.onOpenSlot?.(id, entry.access, entry.key),
                                          ))}
                                    title={`${access} slot ${label}${submachine ? "" : " \u2014 click to edit path"}`}
                                    style={submachine ? undefined : { cursor: "pointer" }}
                                >
                                    <span className="node-slot-key">{label}</span>
                                </span>
                                <Handle
                                    id={entry.handleId}
                                    type="source"
                                    isConnectableStart={true}
                                    isConnectableEnd={false}
                                    position={Position.Bottom}
                                    className={`source-handle skill-slot-handle slot-skill-${entry.access}-handle ${dragClass}`}
                                    title={`${access} ${label}`}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

function StateCard({ id, data, selected, submachine = false }) {
    const mode = data.mode || "overview";
    const showEvents = mode === "event" || mode === "overview";
    const showSlots = mode === "slots" || mode === "overview";
    const instanceId = submachine
        ? ""
        : textValue(data.editorInstanceId || "")
          ? `#${textValue(data.editorInstanceId || "")}`
          : data.fullSkillName && data.fullSkillName.includes("#")
            ? `#${data.fullSkillName.split("#")[1]}`
            : "";
    const baseName = String(data.fullSkillName || data.label || "")
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();
    const isFinalState =
        !submachine && (Boolean(data.isFinal) || baseName === "end" || baseName === "fatal");
    const isBehaviorExit = !submachine && Boolean(data.isBehaviorExit);
    const terminal = isFinalState || isBehaviorExit;
    const slotEntries = useMemo(
        () =>
            getStateSlotEntries(
                {
                    inSlots: data.inSlots,
                    outSlots: data.outSlots,
                    inheritedSlots: data.inheritedSlots,
                },
                submachine ? "submachine" : "custom",
            ),
        [data.inSlots, data.outSlots, data.inheritedSlots, submachine],
    );
    const eventIds = useMemo(() => {
        const ids = (data.events || [])
            .map((event) => (submachine ? String(event?.id || "").trim() : event.id))
            .filter(Boolean);
        if (!submachine && !terminal) ids.push("fatal");
        return [...new Set(ids)];
    }, [data.events, submachine, terminal]);
    const summaryEntries = useMemo(
        () =>
            submachine
                ? (data.localDataModel || [])
                      .filter(
                          (entry) =>
                              String(entry?.id || "").trim() &&
                              textValue(entry.id) !== "#_STATE_PREFIX",
                      )
                      .map((entry) => ({
                          key: textValue(entry.id),
                          value: textValue(entry.expr),
                          displayValue: textValue(entry.expr),
                      }))
                : getParameterEntries({
                      params: data.params,
                      runtimeParameterValues: data.runtimeParameterValues,
                  }),
        [data.params, data.runtimeParameterValues, data.localDataModel, submachine],
    );
    const hasEvents = showEvents && !terminal && eventIds.length > 0;
    const hasSummary = mode === "overview" && summaryEntries.length > 0;
    const hasSlots = showSlots && slotEntries.length > 0;
    const width = useMemo(
        () =>
            Math.max(
                !submachine && data.isInitial && (mode === "overview" || mode === "slots")
                    ? Math.min(
                          520,
                          Math.max(
                              260,
                              150 + `${String(data.label || "")} ${instanceId}`.trim().length * 7,
                          ),
                      )
                    : 0,
                hasSummary
                    ? estimateSummaryWidth(
                          data.label,
                          summaryEntries.map((entry) =>
                              entry.displayValue
                                  ? `${entry.key} = ${entry.displayValue}`
                                  : entry.key,
                          ),
                      )
                    : 0,
                hasSlots ? estimateSlotDockWidth(slotEntries) : 0,
            ) || undefined,
        [
            submachine,
            data.isInitial,
            data.label,
            mode,
            instanceId,
            hasSummary,
            summaryEntries,
            hasSlots,
            slotEntries,
        ],
    );
    const signature = [
        mode,
        ...eventIds,
        ...slotEntries.map((entry) => entry.handleId),
        ...summaryEntries.map((entry) =>
            submachine
                ? `${entry.key}=${entry.value}`
                : `${entry.key}=${entry.value}|default=${entry.defaultValue}`,
        ),
        width || "auto",
    ].join("|");
    useNodeHandleLayout(id, signature);
    const warning = useMemo(() => {
        if (!submachine) return getSkillWarning(data, { showEvents, showSlots, terminal });
        const unexposed = [
            ...new Set(
                (data.unexposedTransitionHandles || [])
                    .map((handle) => String(handle || "").trim())
                    .filter(Boolean),
            ),
        ];
        return unexposed.length
            ? `Transition uses unexposed exit token${unexposed.length === 1 ? "" : "s"}: ${unexposed.join(", ")}`
            : "";
    }, [data, submachine, showEvents, showSlots, terminal]);

    return (
        <div
            className={`${submachine ? "submachine-node" : "costum-node"} ${data.isInitial ? "initial-node" : ""} ${selected ? "selected-node" : ""} ${isFinalState ? "terminal-final-node" : ""} ${isBehaviorExit ? "behavior-exit-node" : ""} ${hasSlots ? "has-slot-dock" : ""} mode-${mode}`}
            style={width ? { width: `${width}px`, maxWidth: "520px" } : undefined}
        >
            <StateActionBadges id={id} data={data} />
            <NodeWarning title={warning} />
            {showEvents && <IncomingTransitionHandle data={data} reconnect />}
            {submachine ? (
                <>
                    <NodeTitle
                        className="submachine-header"
                        initial={data.isInitial}
                        typeLabel="Sub-State-Machine"
                        badgeClassName="submachine-badge"
                    >
                        <button
                            type="button"
                            className="open-sub-tab-button nodrag nopan"
                            title="Open sub-state machine"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                data.onOpenSubMachine?.(data.src, data.label);
                            }}
                        >
                            <FiExternalLink />
                        </button>
                    </NodeTitle>
                    <NodeTitle className="custom-node-label" label={data.label || id} />
                </>
            ) : (
                <NodeTitle
                    className="custom-node-label"
                    initial={data.isInitial}
                    typeLabel={terminal ? undefined : "SKILL"}
                    badgeClassName="skill-type-badge"
                    label={data.label}
                >
                    {instanceId && (
                        <span style={{ marginLeft: "4px", color: "#64748b", fontWeight: 600 }}>
                            {instanceId}
                        </span>
                    )}
                </NodeTitle>
            )}
            {hasEvents && (
                <EventPorts
                    id={id}
                    data={data}
                    eventIds={eventIds}
                    editable={!submachine && mode === "overview"}
                />
            )}
            {hasSummary && (
                <>
                    {hasEvents && <div className="node-slot-divider" />}
                    <ValueSummary id={id} data={data} entries={summaryEntries} local={submachine} />
                </>
            )}
            {hasSlots && (
                <>
                    {(hasEvents || hasSummary) && <div className="node-slot-divider" />}
                    <SlotDock id={id} data={data} entries={slotEntries} submachine={submachine} />
                </>
            )}
        </div>
    );
}

function ReferenceNode({ id, data, selected, skill = false }) {
    const referenceId = String(data.editorInstanceId || id || "").trim();
    const sourceType = String(data.sourceNodeType || "state");
    useNodeHandleLayout(id, `${data.label}|${referenceId}|${sourceType}`);
    return (
        <div
            className={`state-clone-node ${skill ? "" : `state-clone-${sourceType}`} ${selected ? "selected-node" : ""}`}
            style={skill ? { borderLeftColor: "#0f766e" } : undefined}
        >
            <IncomingTransitionHandle data={data} reconnect={skill} />
            <NodeTitle
                className="state-clone-header"
                typeLabel={skill ? "SKILL" : REFERENCE_TYPES[sourceType] || "STATE"}
                badgeClassName="state-clone-type"
                leading={
                    <span className="state-clone-reference-mark" aria-hidden="true">
                        <FiLink2 />
                    </span>
                }
            >
                <span
                    className="state-clone-badge"
                    title={referenceId ? `Reference ID: ${referenceId}` : "Reference"}
                >
                    {referenceId ? `REF \u00b7 ${referenceId}` : "REF"}
                </span>
            </NodeTitle>
            <div className="state-clone-label">
                {data.label || data.fullSkillName || (skill ? "Skill" : "State")}
            </div>
        </div>
    );
}

export function SkillNode(props) {
    return props.data.isSkillClone ? <ReferenceNode {...props} skill /> : <StateCard {...props} />;
}

export function SubMachineNode(props) {
    return <StateCard {...props} submachine />;
}

export function StateReferenceNode({ data = {}, selected = false, ...props }) {
    return <ReferenceNode {...props} data={data} selected={selected} />;
}
