import { Handle, Position } from "@xyflow/react";

function CustomNode({ data }) {
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

      <div className="custom-node-label">{data.label}</div>

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