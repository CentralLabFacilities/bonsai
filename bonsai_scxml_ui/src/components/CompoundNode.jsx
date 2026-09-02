import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function CompoundNode({ id, data }) {
  return (
    <div className={`compound-frame-node ${data.isInitial ? 'initial-compound' : ''}`}>
      {/* Target-Handle falls der gesamte Compound State von außen angesprungen wird */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="target-handle"
      />

      {/* Header: Schlicht oben links */}
      <div className="compound-frame-header">
        <span className="compound-frame-title">{data.label || id}</span>
      </div>
    </div>
  );
}