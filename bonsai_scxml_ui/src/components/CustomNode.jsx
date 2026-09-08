import { useMemo } from "react";
import { Handle, Position, useEdges } from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";

function CustomNode({ id, data, selected }) {
  const edges = useEdges();

  const instanceId = data.fullSkillName && data.fullSkillName.includes("#")
    ? `#${data.fullSkillName.split("#")[1]}`
    : "";

  const validation = useMemo(() => {
    const allSlots = [...(data.inSlots || []), ...(data.outSlots || [])];
    const missingSlots = allSlots.some(
      (slot) => !slot.path || String(slot.path).trim() === ""
    );

    const missingParams = (data.params || []).some((param) => {
      if (!param.required) return false;
      const val = param.expr !== undefined && param.expr !== null ? String(param.expr).trim() : "";
      const def = param.default !== undefined && param.default !== null ? String(param.default).trim() : "";
      return val === "" && def === "";
    });

    const outgoingHandles = new Set(
      edges.filter((e) => e.source === id).map((e) => e.sourceHandle)
    );

    const hasWildcard = outgoingHandles.has("*");

    let missingTransitions = false;
    if (!hasWildcard) {
      const specificEvents = (data.events || []).filter((e) => e.id !== "*");

      missingTransitions = specificEvents.some((e) => !outgoingHandles.has(e.id));
    }

    const hasError = missingSlots || missingParams || missingTransitions;

    const reasons = [];
    if (missingSlots) reasons.push("Not every slot has a path");
    if (missingParams) reasons.push("Required parameters are missing");
    if (missingTransitions) reasons.push("Not every transition is set");

    return { hasError, tooltip: reasons.join("\n") };
  }, [data, edges, id]);

  return (
      <div
        className={`costum-node ${data.isInitial ? "initial-node" : ""} ${
          selected ? "selected-node" : ""
        }`}
      >
      {/* Warnungs-Badge / Ausrufezeichen */}
      {validation.hasError && (
        <div className="node-warning-badge" title={validation.tooltip}>
          <FiAlertCircle />
        </div>
      )}

      {/* Target handle for incoming transitions */}
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
      />

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

      {/* Label */}
      <div className="custom-node-label">
        {data.label}
        {instanceId && (
          <span style={{ marginLeft: "4px", color: "#64748b", fontWeight: 600 }}>
            {instanceId}
          </span>
        )}
      </div>

      {/* Event outputs */}
      <div className="event-list">
        {[...new Set((data.events || []).map((event) => event.id))].map((eventId) => (
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
    </div>
  );
}

export default CustomNode;