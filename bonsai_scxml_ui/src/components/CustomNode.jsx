import { Handle, Position } from "@xyflow/react";

function CustomNode({ data }) {
  // Holt z. B. "#1" aus "skills.dialog.Say#1"
  const instanceId = data.fullSkillName && data.fullSkillName.includes("#")
    ? `#${data.fullSkillName.split("#")[1]}`
    : "";

  return (
    <div className={data.isInitial ? "costum-node initial-node" : "costum-node"}>
      {/* Target handle for incoming transitions*/}
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

      {/* Label  */}
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