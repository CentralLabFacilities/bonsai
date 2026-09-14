import { Handle, Position } from '@xyflow/react';
import StateActionBadges from './StateActionBadges';
import { getTransitionExitToken } from '../utils/transitionEvents.js';

export default function CompoundNode({ id, data }) {
    const events = data.events || [];

    const uniqueEvents = Array.from(
        new Map(
            events.map((evt) => {
                const fullEventName = String(evt.rawEvent || evt.name || evt.id || '');
                const handleId = String(evt.id || getTransitionExitToken(fullEventName, data.fullSkillName) || 'success');

                return [
                    handleId,
                    {
                        handleId,
                        displayLabel: fullEventName,
                    },
                ];
            })
        ).values()
    );

    return (
        <div className={`compound-frame-node ${data.isInitial ? 'initial-compound' : ''}`}>
            <StateActionBadges onEntry={data.onEntry} onExit={data.onExit} />

            {/* Target-Handle für Transitions auf den Compound-State */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="target-handle"
            />

            {/* Header oben links */}
            <div className="compound-frame-header">
                <span className="compound-frame-title">{data.label || id}</span>
            </div>

            {/* Exits am rechten Rand */}
            {uniqueEvents.length > 0 && (
                <div className="compound-frame-exits">
                    {uniqueEvents.map((evt) => (
                        <div key={evt.handleId} className="compound-frame-exit-item">
                            <span className="compound-frame-exit-label">{evt.displayLabel}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={evt.handleId}
                                className="source-handle compound-frame-source-handle"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
