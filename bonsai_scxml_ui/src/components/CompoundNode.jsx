import { useEffect } from "react";
import {
    Handle,
    Position,
    useUpdateNodeInternals,
} from "@xyflow/react";

import StateActionBadges from "./StateActionBadges";
import { getTransitionExitToken } from "../utils/transitionEvents.js";

export default function CompoundNode({ id, data }) {
    const updateNodeInternals = useUpdateNodeInternals();

    const events = data.events || [];

    const uniqueEvents = Array.from(
        new Map(
            events.map((evt) => {
                const fullEventName = String(
                    evt.rawEvent ||
                    evt.name ||
                    evt.id ||
                    ""
                );

                const handleId = String(
                    evt.id ||
                    getTransitionExitToken(
                        fullEventName,
                        data.fullSkillName
                    ) ||
                    "success"
                );

                return [
                    handleId,
                    {
                        handleId,
                        displayLabel:
                            fullEventName || handleId,
                    },
                ];
            })
        ).values()
    );

    const handleSignature = uniqueEvents
        .map((evt) => evt.handleId)
        .join("|");

    useEffect(() => {
        requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
    }, [
        id,
        handleSignature,
        updateNodeInternals,
    ]);

    return (
        <div
            className={`compound-frame-node ${
                data.isInitial
                    ? "initial-compound"
                    : ""
            } ${
                data.isDropTarget
                    ? "compound-drop-target"
                    : ""
            }`}
        >
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() =>
                    data.onOpenStateActions?.(id)
                }
                onExitClick={() =>
                    data.onOpenStateActions?.(id)
                }
            />

            {/* Incoming transition to the Compound state itself */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="target-handle"
            />

            <div className="compound-frame-header">
                <span className="compound-frame-title">
                    {data.label || id}
                </span>
            </div>

            {/* Exits on the right side */}
            {uniqueEvents.length > 0 && (
                <div className="compound-frame-exits">
                    {uniqueEvents.map((evt) => (
                        <div
                            key={evt.handleId}
                            className="compound-frame-exit-item"
                        >
                            <span className="compound-frame-exit-label">
                                {evt.displayLabel}
                            </span>

                            {/*
                                Internal transition:
                                child state -> Compound exit
                            */}
                            <Handle
                                type="target"
                                position={Position.Right}
                                id={`target-${evt.handleId}`}
                                className="target-handle compound-frame-internal-target-handle"
                            />

                            {/*
                                External transition:
                                Compound exit -> outside state
                            */}
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