import { Handle, Position } from '@xyflow/react';
import StateActionBadges from './StateActionBadges';

export default function ParallelNode({ id, data }) {
  const lanes = data.lanes || data.branches || ['Lane 1', 'Lane 2'];

  return (
    <div className="parallel-group-container">
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

      {/* Horizontal lines without text watermarks */}
      <div className="parallel-group-lanes">
        {lanes.map((_, idx) => (
          <div key={idx} className="parallel-group-lane-row" />
        ))}
      </div>
    </div>
  );
}
