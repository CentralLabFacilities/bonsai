import { Handle, Position } from '@xyflow/react';
import StateActionBadges from './StateActionBadges';
import { FiPlus } from 'react-icons/fi';

export default function ParallelNode({ id, data }) {
  return (
    <div
        className={
            data.isDropTarget
                ? "parallel-group-container parallel-drop-target"
                : "parallel-group-container"
        }
    >
      {/* Target-Handle links für Transitions auf den gesamten Parallel-State */}
      <StateActionBadges onEntry={data.onEntry} onExit={data.onExit} />

      {/* Target handle for transitions to the entire parallel state */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="parallel-group-handle"
      />

      <div className="parallel-group-header">
        <span className="parallel-badge">PARALLEL</span>
        <strong className="parallel-title">{data.label || id}</strong>
      </div>

        <button
          className="parallel-add-lane-btn"
          title="Add new row"
          onClick={(e) => {
            e.stopPropagation();
            if (data.onAddLane) {
              data.onAddLane(id);
            }
          }}
        >
          <FiPlus size={12} />
        </button>
    </div>
  );
}
