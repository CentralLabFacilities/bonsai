import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function ParallelLaneNode({ id, data }) {
  const events = data.events || [];

  const uniqueEvents = Array.from(
    new Map(
      events.map((evt) => {
        const fullEventName = String(evt.rawEvent || evt.name || evt.id || '');
        const handleId = String(evt.id || fullEventName.split('.*')[0].split('.').pop() || 'success');
        return [
          handleId,
          {
            handleId,
            displayLabel: fullEventName || handleId,
          },
        ];
      })
    ).values()
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        boxSizing: 'border-box',
        pointerEvents: 'all',
        pointerEvents: 'none',
      }}
    >
      {/* Exits genau am rechten Rand dieser Lane */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'flex-end',
          pointerEvents: 'all', /* Handles bleiben anklickbar */
          zIndex: 15,
        }}
      >
        {uniqueEvents.map((evt) => (
          <div
            key={evt.handleId}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* INTERNES TARGET */}
            <Handle
              type="target"
              position={Position.Left}
              id={`target-${evt.handleId}`}
              style={{
                left: -6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 6,
                height: 6,
                backgroundColor: '#0284c7',
                border: '1px solid #ffffff',
                borderRadius: '50%',
              }}
            />

            <span className="compound-frame-exit-label">
              {evt.displayLabel}
            </span>

            {/* EXTERNES SOURCE */}
            <Handle
              type="source"
              position={Position.Right}
              id={evt.handleId}
              className="source-handle compound-frame-source-handle"
              style={{
                right: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}