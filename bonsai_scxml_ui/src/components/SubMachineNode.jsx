import { useEffect, useMemo } from "react";
import {
    Handle,
    Position,
    useUpdateNodeInternals,
} from "@xyflow/react";
import { FiExternalLink } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

const getSlotHandleDragClass = ({
                                    drag,
                                    nodeId,
                                    handleId,
                                    access,
                                    slotType,
                                }) => {
    if (!drag?.active) return "";

    const isActiveHandle =
        drag.nodeId === nodeId && drag.handleId === handleId;

    if (isActiveHandle) {
        return "slot-handle-compatible slot-handle-active";
    }

    const isDestinationSide = drag.origin !== "submachine";
    const accessMatches = drag.access === access;
    const typeMatches =
        Boolean(drag.slotType) &&
        normalizeSlotType(slotType) === drag.slotType;

    return isDestinationSide && accessMatches && typeMatches
        ? "slot-handle-compatible"
        : "slot-handle-incompatible";
};

const formatDataModelValue = (entry) => {
    if (entry?.expr === undefined || entry?.expr === null) {
        return "";
    }

    return String(entry.expr).trim();
};

export default function SubMachineNode({ id, data, selected }) {
    const updateNodeInternals = useUpdateNodeInternals();

    // "event"    -> transitions only
    // "slots"    -> slots only
    // "overview" -> local datamodel, transitions and slots
    const mode = data.mode || "overview";
    const showEvents = mode === "event" || mode === "overview";
    const showSlots = mode === "slots" || mode === "overview";
    const showLocalDataModel = mode === "overview";

    const eventIds = useMemo(
        () => [
            ...new Set(
                (data.events || [])
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            ),
        ],
        [data.events]
    );

    const localDataModelEntries = useMemo(
        () =>
            (data.localDataModel || [])
                .filter((entry) => {
                    const entryId = String(entry?.id || "").trim();
                    return entryId && entryId !== "#_STATE_PREFIX";
                })
                .map((entry) => ({
                    id: String(entry.id).trim(),
                    expr: formatDataModelValue(entry),
                })),
        [data.localDataModel]
    );

    const slotEntries = useMemo(() => {
        const regularSlots = [
            ...(data.inSlots || []).map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: "read",
                index,
                handleId: `slot-skill-read-${index}`,
                inherited: Boolean(slot.inherited),
            })),
            ...(data.outSlots || []).map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: "write",
                index,
                handleId: `slot-skill-write-${index}`,
                inherited: Boolean(slot.inherited),
            })),
        ];

        const inheritedSlots = (data.inheritedSlots || [])
            .map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: slot.access,
                index,
                handleId:
                    slot.access === "read" || slot.access === "write"
                        ? `slot-submachine-${slot.access}-${index}`
                        : null,
                inherited: true,
            }))
            .filter(
                (slot) =>
                    slot.handleId &&
                    (slot.access === "read" || slot.access === "write")
            );

        return [...regularSlots, ...inheritedSlots].filter(
            (entry) =>
                String(entry.key || entry.path || "").trim()
        );
    }, [data.inSlots, data.outSlots, data.inheritedSlots]);

    const overviewWidth = useMemo(() => {
        let requiredWidth = 0;

        if (showLocalDataModel && localDataModelEntries.length > 0) {
            const longestRow = localDataModelEntries.reduce((longest, entry) => {
                const text = entry.expr
                    ? `${entry.id} = ${entry.expr}`
                    : entry.id;

                return Math.max(longest, text.length);
            }, String(data.label || "").length);

            requiredWidth = Math.max(
                requiredWidth,
                Math.min(520, Math.max(190, 55 + longestRow * 7))
            );
        }

        if (showSlots && slotEntries.length > 0) {
            const slotGutters = 16 + 24;
            const minimumPortWidth = 25;

            // Match the normal skill-node dock: one/two slots stay horizontal
            // and therefore reserve enough room for their full labels. Three or
            // more slots use the compact -55deg layout and only need the 25px
            // minimum spacing between connection points.
            const requiredSlotWidth =
                slotEntries.length <= 2
                    ? slotGutters +
                    slotEntries.reduce((total, entry) => {
                        const label = String(
                            entry.key || entry.path || "Slot"
                        );
                        const estimatedLabelWidth = Math.min(
                            92,
                            Math.max(
                                minimumPortWidth,
                                12 + label.length * 6.5
                            )
                        );
                        return total + estimatedLabelWidth;
                    }, 0) +
                    Math.max(0, slotEntries.length - 1) * 12
                    : slotGutters + slotEntries.length * minimumPortWidth;

            requiredWidth = Math.max(
                requiredWidth,
                Math.min(520, Math.max(180, requiredSlotWidth))
            );
        }

        return requiredWidth || undefined;
    }, [
        data.label,
        localDataModelEntries,
        showLocalDataModel,
        showSlots,
        slotEntries,
    ]);

    const handleSignature = useMemo(
        () =>
            [
                mode,
                ...eventIds,
                ...slotEntries.map((entry) => entry.handleId),
                ...localDataModelEntries.map(
                    (entry) => `${entry.id}=${entry.expr}`
                ),
                overviewWidth || "auto",
            ].join("|"),
        [
            mode,
            eventIds,
            slotEntries,
            localDataModelEntries,
            overviewWidth,
        ]
    );

    useEffect(() => {
        requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
    }, [id, handleSignature, updateNodeInternals]);

    const hasEvents = showEvents && eventIds.length > 0;
    const hasSlots = showSlots && slotEntries.length > 0;

    return (
        <div
            className={`submachine-node ${
                data.isInitial ? "initial-node" : ""
            } ${selected ? "selected-node" : ""} ${
                hasSlots ? "has-slot-dock" : ""
            } mode-${mode}`}
            style={
                overviewWidth
                    ? {
                        width: `${overviewWidth}px`,
                        maxWidth: "520px",
                    }
                    : undefined
            }
        >
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() => data.onOpenStateActions?.(id)}
                onExitClick={() => data.onOpenStateActions?.(id)}
            />

            {showEvents && (
                <Handle
                    id="transition-target"
                    type="target"
                    position={Position.Left}
                    className="target-handle"
                    isConnectableStart={false}
                    isConnectableEnd={true}
                />
            )}

            <div className="submachine-header">
                {data.isInitial && (
                    <span className="initial-state-badge initial-state-badge-inline">INITIAL</span>
                )}
                <span className="submachine-badge">
                    Sub-State-Machine
                </span>

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
            </div>

            <div className="custom-node-label">
                {data.label || id}
            </div>

            {hasEvents && (
                <div className="event-list">
                    {eventIds.map((eventId) => (
                        <div className="event-row" key={eventId}>
                            <span className="event-name">{eventId}</span>

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
            )}

            {showLocalDataModel && localDataModelEntries.length > 0 && (
                <>
                    {hasEvents && <div className="node-slot-divider" />}

                    <div
                        className="submachine-datamodel-summary"
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            padding: "6px 10px 6px",
                        }}
                    >
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

                        {localDataModelEntries.map((entry) => (
                            <div
                                key={entry.id}
                                title={
                                    entry.expr
                                        ? `${entry.id} = ${entry.expr}`
                                        : entry.id
                                }
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "6px",
                                    minWidth: 0,
                                    fontSize: "10px",
                                    lineHeight: 1.35,
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 700,
                                        color: "#6b21a8",
                                        overflowWrap: "anywhere",
                                    }}
                                >
                                    {entry.id}
                                </span>

                                {entry.expr && (
                                    <>
                                        <span
                                            aria-hidden="true"
                                            style={{ color: "#a78bfa" }}
                                        >
                                            =
                                        </span>
                                        <span
                                            style={{
                                                color: "#3b0764",
                                                fontFamily:
                                                    "Consolas, Monaco, 'Courier New', monospace",
                                                overflowWrap: "anywhere",
                                                minWidth: 0,
                                            }}
                                        >
                                            {entry.expr}
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {hasSlots && (
                <>
                    {(hasEvents ||
                        (showLocalDataModel && localDataModelEntries.length > 0)) && (
                        <div className="node-slot-divider" />
                    )}

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
                        className={`node-slot-summary ${
                            slotEntries.length >= 3
                                ? "node-slot-summary-slanted"
                                : "node-slot-summary-horizontal"
                        }`}
                    >
                        <div className="skill-slot-border-rail" aria-hidden="true">
                            {slotEntries.map((entry) => {
                                const label = String(
                                    entry.key || entry.path || "Slot"
                                );
                                return (
                                    <span
                                        key={`rail-${entry.handleId}-${label}`}
                                        className={`skill-slot-border-segment skill-slot-border-segment-${entry.access}`}
                                    />
                                );
                            })}
                        </div>

                        <div className="node-slot-ports">
                            {slotEntries.map((entry) => {
                                const dragClass = getSlotHandleDragClass({
                                    drag: data.slotConnectionDrag,
                                    nodeId: id,
                                    handleId: entry.handleId,
                                    access: entry.access,
                                    slotType: entry.type,
                                });

                                const label = String(
                                    entry.key || entry.path || "Slot"
                                );

                                return (
                                    <div
                                        key={`${entry.handleId}-${label}`}
                                        className={`node-slot-row node-slot-row-${entry.access}`}
                                    >
                                        <span
                                            className={`node-slot-entry ${
                                                entry.inherited
                                                    ? "node-slot-entry-inherited"
                                                    : ""
                                            }`}
                                            title={`${
                                                entry.access === "read"
                                                    ? "Read"
                                                    : "Write"
                                            } slot ${label}`}
                                        >
                                            <span className="node-slot-key">
                                                {label}
                                            </span>
                                        </span>

                                        <Handle
                                            id={entry.handleId}
                                            type="source"
                                            position={Position.Bottom}
                                            className={`source-handle skill-slot-handle slot-skill-${entry.access}-handle ${dragClass}`}
                                            title={`${
                                                entry.access === "read"
                                                    ? "Read"
                                                    : "Write"
                                            } ${label}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
