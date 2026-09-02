import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function CompoundNode({ id, data }) {
  const subStates = data.subStates || [];
  const events = data.events || [];

  return (
    <div className={`compound-node-container ${data.isInitial ? 'initial-compound' : ''}`}>
      {/* Target handle for transitions to the compound state */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="target-handle"
      />

      <div className="compound-header">
        <span className="compound-badge">COMPOUND</span>
        <strong className="compound-title">{data.label || id}</strong>
        {data.initialSubState && (
          <span className="compound-initial-badge">Start: {data.initialSubState}</span>
        )}
      </div>

      {/* Internal states */}
      <div className="compound-inner-flow">
        {subStates.map((sub, idx) => (
          <div key={sub.id || idx} className="compound-substate-card">
            <div className="substate-header">
              <span className="substate-name">{sub.name || sub.id}</span>
            </div>
            {sub.internalTransitions && sub.internalTransitions.length > 0 && (
              <div className="substate-loops">
                {sub.internalTransitions.map((t, tIdx) => (
                  <div key={tIdx} className="substate-loop-item">
                    <span>{t.event}</span> → <strong>{t.target.split('.').pop()}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Parent transitions/exits at the compound level */}
      {events.length > 0 && (
        <div className="compound-events">
          {events.map((evt, idx) => {
            const rawId = String(evt.id || evt.name || `exit-${idx}`);
            const handleId = rawId.split('.*')[0].split('.').pop();
            return (
              <div key={idx} className="compound-event-row">
                <span className="compound-event-name">{rawId}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handleId}
                  className="source-handle compound-source-handle"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}