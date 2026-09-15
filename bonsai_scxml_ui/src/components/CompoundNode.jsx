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

    /*
     * =========================================================
     * EXIT EVENTS
     * =========================================================
     *
     * Genau wie bei einer Parallel-Lane:
     *
     * interne Node
     *      |
     *      | gestrichelte interne Edge
     *      v
     * target-${handleId}
     *      |
     *      | Compound-Rand
     *      |
     * ${handleId}
     *      |
     *      | äußere Edge
     *      v
     * externe Node
     */

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


    /*
     * =========================================================
     * REACT FLOW HANDLES NEU BERECHNEN
     * =========================================================
     *
     * Die Exit-Handles entstehen dynamisch.
     * Deshalb muss React Flow informiert werden,
     * sobald sich die Events ändern.
     */

    useEffect(() => {
        requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
    }, [
        id,
        events.length,
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

            {/* =========================================
                ON ENTRY / ON EXIT BADGES
               ========================================= */}

            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
            />


            {/* =========================================
                NORMALER EINGANG DES COMPOUNDS

                Externe Transition -> Compound
               ========================================= */}

            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="target-handle"
            />


            {/* =========================================
                HEADER
               ========================================= */}

            <div className="compound-frame-header">
                <span className="compound-frame-title">
                    {data.label || id}
                </span>
            </div>


            {/* =========================================
                EXITS AM RECHTEN RAND

                Wie bei Parallel mit einer Lane.
               ========================================= */}

            {uniqueEvents.length > 0 && (
                <div className="compound-frame-exits">

                    {uniqueEvents.map((evt) => (
                        <div
                            key={evt.handleId}
                            className="compound-frame-exit-item"
                        >

                            {/* =============================
                                LABEL
                               ============================= */}

                            <span className="compound-frame-exit-label">
                                {evt.displayLabel}
                            </span>


                            {/* =============================
                                INTERNER TARGET-HANDLE

                                interne Node
                                     |
                                     +---------->
                                              X

                                Die interne Edge benutzt:

                                targetHandle:
                                    `target-${handleId}`
                               ============================= */}

                            <Handle
                                type="target"
                                position={Position.Right}
                                id={`target-${evt.handleId}`}
                                className="
                                    target-handle
                                    compound-frame-internal-target-handle
                                "
                            />


                            {/* =============================
                                EXTERNER SOURCE-HANDLE

                                X -----------------> externe Node

                                Die äußere Edge benutzt:

                                sourceHandle:
                                    handleId
                               ============================= */}

                            <Handle
                                type="source"
                                position={Position.Right}
                                id={evt.handleId}
                                className="
                                    source-handle
                                    compound-frame-source-handle
                                "
                            />

                        </div>
                    ))}

                </div>
            )}

        </div>
    );
}