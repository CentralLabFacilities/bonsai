import { useMemo } from "react";
import { Handle, Position, useEdges } from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

function CustomNode({ id, data, selected }) {
  const edges = useEdges();

  const instanceId =
    data.fullSkillName && data.fullSkillName.includes("#")
      ? `#${data.fullSkillName.split("#")[1]}`
      : "";

  // Supported modes:
  // "event" -> show events only
  // "slot"  -> show slots only
  // "both"  -> show events and slots
  const mode = data.mode || "both";

  const showEvents = mode === "event" || mode === "both";
  const showSlots = mode === "slots" || mode === "both";

  const validation = useMemo(() => {
    const allSlots = [...(data.inSlots || []), ...(data.outSlots || [])];

    const missingSlots = allSlots.some(
      (slot) => !slot.path || String(slot.path).trim() === ""
    );

    const missingParams = (data.params || []).some((param) => {
      if (!param.required) return false;

      const val =
        param.expr !== undefined && param.expr !== null
          ? String(param.expr).trim()
          : "";

      const def =
        param.default !== undefined && param.default !== null
          ? String(param.default).trim()
          : "";

      return val === "" && def === "";
    });

    const outgoingHandles = new Set(
      edges.filter((e) => e.source === id).map((e) => e.sourceHandle)
    );

    const hasWildcard = outgoingHandles.has("*");

    let missingTransitions = false;

    // Only validate transitions when events are actually part of the mode.
    if (showEvents && !hasWildcard) {
      const specificEvents = (data.events || []).filter(
        (e) => e.id !== "*"
      );

      missingTransitions = specificEvents.some(
        (e) => !outgoingHandles.has(e.id)
      );
    }

    // Only validate slots when slots are actually part of the mode.
    const hasMissingSlots = showSlots ? missingSlots : false;

    const hasError =
      hasMissingSlots || missingParams || missingTransitions;

    const reasons = [];

    if (hasMissingSlots) {
      reasons.push("Not every slot has a path");
    }

    if (missingParams) {
      reasons.push("Required parameters are missing");
    }

    if (missingTransitions) {
      reasons.push("Not every transition is set");
    }

    return {
      hasError,
      tooltip: reasons.join("\n"),
    };
  }, [data, edges, id, showEvents, showSlots]);

  const slotSummary = useMemo(() => {
    const seen = new Set();

    return [...(data.inSlots || []), ...(data.outSlots || [])]
      .filter((slot) => {
        const key = String(slot.key || "").trim();

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .map((slot) => ({
        key: slot.key,
        inherited: Boolean(slot.inherited),
      }));
  }, [data.inSlots, data.outSlots]);

  const eventIds = useMemo(() => {
    return [...new Set((data.events || []).map((event) => event.id))];
  }, [data.events]);

  return (
    <div
      className={`costum-node ${data.isInitial ? "initial-node" : ""} ${
        selected ? "selected-node" : ""
      } mode-${mode}`}
    >
      <StateActionBadges
        onEntry={data.onEntry}
        onExit={data.onExit}
      />

      {/* Warning badge */}
      {validation.hasError && (
        <div
          className="node-warning-badge"
          title={validation.tooltip}
        >
          <FiAlertCircle />
        </div>
      )}

      {/* Target handle for incoming transitions */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
      />

      {/* Slot handles - hidden in event mode */}
      {showSlots && (
        <>
          {/* Out-Slots Handles */}
          {(data.outSlots || []).map((slot, index) => (
            <Handle
              key={slot.key || index}
              id={`write-source-${index}`}
              type="source"
              position={Position.Bottom}
              className="slot-write-handle"
              style={{ left: `${10 + index * 40}%` }}
            />
          ))}

          {/* In-Slots Handles */}
          {(data.inSlots || []).map((slot, index) => (
            <Handle
              key={slot.key || index}
              id={`read-target-${index}`}
              type="target"
              position={Position.Top}
              className="slot-read-handle"
              style={{ left: `${10 + index * 40}%` }}
            />
          ))}
        </>
      )}

      {/* Label */}
      <div className="custom-node-label">
        {data.label}

        {instanceId && (
          <span
            style={{
              marginLeft: "4px",
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            {instanceId}
          </span>
        )}
      </div>

      {/* Event outputs - hidden in slot mode */}
      {showEvents && eventIds.length > 0 && (
        <div className="event-list">
          {eventIds.map((eventId) => (
            <div className="event-row" key={eventId}>
              <span className="event-name">{eventId}</span>

              <Handle
                id={eventId}
                type="source"
                position={Position.Right}
                className="source-handle"
              />
            </div>
          ))}
        </div>
      )}

      {/* Slot keys - hidden in event mode */}
      {showSlots && slotSummary.length > 0 && (
        <>
          {/* Divider only when events are also visible */}
          {showEvents && <div className="node-slot-divider" />}

          <div className="node-slot-summary">
            {slotSummary.map((entry) => (
              <span
                key={entry.key}
                className={`node-slot-chip ${
                  entry.inherited
                    ? "node-slot-chip-inherited"
                    : ""
                }`}
                title={`Slot${
                  entry.inherited ? " (inherited)" : ""
                }`}
              >
                {entry.key}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default CustomNode;