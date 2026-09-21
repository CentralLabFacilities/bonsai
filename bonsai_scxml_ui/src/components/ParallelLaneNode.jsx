import React from "react";
import { Handle, Position } from "@xyflow/react";

export default function ParallelLaneNode({ data = {} }) {
    const events = Array.isArray(data.events) ? data.events : [];
    const uniqueEvents = [];
    const seen = new Set();

    events.forEach((event) => {
        const eventId = String(event?.id || "").trim();
        if (!eventId || eventId === "compound-entry" || seen.has(eventId)) return;
        seen.add(eventId);
        uniqueEvents.push({ ...event, id: eventId });
    });

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                boxSizing: "border-box",
                pointerEvents: "none",
            }}
        >
            {/* Display-only entry point for this parallel branch. */}
            <Handle
                type="source"
                position={Position.Right}
                id="parallel-entry"
                className="target-handle"
                style={{
                    top: "50%",
                    left: "-5px",
                    right: "auto",
                    backgroundColor: "#0284c7",
                    borderColor: "#ffffff",
                }}
                isConnectableStart={false}
                isConnectableEnd={false}
            />

            {/*
             * Parallel boundary exits intentionally use the exact same markup
             * and classes as Compound exits. This keeps their label, internal
             * target point and external source point visually identical.
             */}
            {uniqueEvents.length > 0 && (
                <div className="compound-frame-exits">
                    {uniqueEvents.map((event) => {
                        const label = event.name || event.rawEvent || event.id;

                        return (
                            <div
                                className="compound-frame-exit-item"
                                key={event.id}
                            >
                                <Handle
                                    id={`target-${event.id}`}
                                    type="target"
                                    position={Position.Left}
                                    className="compound-frame-exit-target-handle"
                                    style={{
                                        opacity: 0,
                                        pointerEvents: "none",
                                    }}
                                    isConnectableStart={false}
                                    isConnectableEnd={false}
                                />

                                <span
                                    className="compound-frame-exit-label"
                                    title={label}
                                >
                                    {label}
                                </span>

                                <Handle
                                    id={event.id}
                                    type="source"
                                    position={Position.Right}
                                    className="compound-frame-source-handle"
                                    isConnectableStart={true}
                                    isConnectableEnd={false}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
