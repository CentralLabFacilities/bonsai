import { getAbsoluteNodePosition } from "./editorGeometry";

export const getSkillPackageName = (fullSkillName) => {
    let baseName = String(fullSkillName || "").split("#")[0];

    const skillsMarker = ".skills.";
    const skillsIndex = baseName.indexOf(skillsMarker);

    if (skillsIndex !== -1) {
        baseName = baseName.slice(
            skillsIndex + skillsMarker.length
        );
    }

    const parts = baseName.split(".").filter(Boolean);

    if (parts.length <= 1) {
        return "";
    }

    return parts.slice(0, -1).join(".");
};

export const getStoredTransitionAssignments = (...sources) => {
    for (const source of sources) {
        if (!source) continue;

        if (Array.isArray(source.assignments)) {
            return source.assignments
                .filter((assignment) => assignment?.location)
                .map((assignment) => ({
                    location: assignment.location,
                    expr: assignment.expr || "",
                }));
        }

        if (source.assign?.location) {
            return [
                {
                    location: source.assign.location,
                    expr: source.assign.expr || "",
                },
            ];
        }

        if (source.assignLocation) {
            return [
                {
                    location: source.assignLocation,
                    expr: source.assignExpr || "",
                },
            ];
        }
    }

    return [];
};

// The editor uses @variable as a visual/reference convention, while Bonsai
// SCXML assignment expressions use the datamodel identifier directly. Keep
// the editor state untouched and normalize only the data passed to the SCXML
// generator. Skill parameter expressions are intentionally NOT normalized.
export const normalizeAssignmentExpressionForScxml = (value) => {
    let expression = String(value ?? "").trim();
    if (!expression) return "";

    // Keep a direct editor variable reference marked until scxmlExport serializes
    // it. The exporter knows that @foo is a reference and emits foo without
    // turning it into the string literal 'foo'.
    if (/^@[A-Za-z_#][A-Za-z0-9_:#.\-]*$/.test(expression)) {
        return expression;
    }

    // Older editor versions could accidentally persist a complete expression
    // as a quoted string. Unwrap that form when it is clearly an expression
    // containing a UI-style @variable reference and an operator. Genuine
    // string literals remain quoted.
    const first = expression[0];
    const last = expression[expression.length - 1];
    if (
        expression.length >= 2 &&
        (first === "\"" || first === "'") &&
        last === first
    ) {
        const inner = expression.slice(1, -1).trim();
        if (
            /@[A-Za-z_#]/.test(inner) &&
            /(?:==|!=|>=|<=|&&|\|\||[+\-*/%<>])/.test(inner)
        ) {
            expression = inner;
        }
    }

    // Only transform unquoted portions so literal strings such as
    // "contact@example.org" or "@literal" are not modified.
    let result = "";
    let unquoted = "";
    let quote = null;
    let escaped = false;

    const flushUnquoted = () => {
        if (!unquoted) return;

        result += unquoted
            // @test_value -> test_value
            .replace(/@(?=[A-Za-z_#])/g, "")
            // Normalize operator spacing for readable generated SCXML.
            .replace(
                /\s*(==|!=|>=|<=|&&|\|\||[+\-*/%<>])\s*/g,
                " $1 "
            )
            .replace(/\s+/g, " ");

        unquoted = "";
    };

    for (const character of expression) {
        if (quote) {
            result += character;

            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            flushUnquoted();
            quote = character;
            result += character;
            continue;
        }

        unquoted += character;
    }

    flushUnquoted();
    return result.trim();
};

export const normalizeAssignmentForScxml = (assignment) =>
    assignment
        ? {
            ...assignment,
            expr: normalizeAssignmentExpressionForScxml(assignment.expr),
        }
        : assignment;

export const getForwardingNopScxmlStateId = (node, eventName) => {
    const fullSkillName = String(node?.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0] || "Nop";
    const normalizedEvent = String(eventName || "").trim();

    if (!normalizedEvent) {
        return String(
            node?.data?.scxmlStateId ||
            node?.data?.behaviorExitScxmlStateId ||
            fullSkillName ||
            skillBase
        ).trim();
    }

    // Keep the SCXML state readable and deterministic while avoiding the
    // editor-only clone/instance id. Nops forwarding the same event therefore
    // share one state, while different events get distinct states.
    const eventSuffix = normalizedEvent
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "send";

    return `${skillBase}#${eventSuffix}`;
};

export const getBehaviorExitSignature = (node) => {
    if (!node?.data?.isBehaviorExit) return "";

    const transitions =
        Array.isArray(node.data?.behaviorExitTransitions) &&
        node.data.behaviorExitTransitions.length > 0
            ? node.data.behaviorExitTransitions
            : [
                {
                    triggerEvent: "Nop.fatal",
                    sendEvents: node.data?.behaviorExitEvents || [],
                },
            ];

    return transitions
        .map((transition) => {
            const trigger = String(transition?.triggerEvent || "Nop.fatal").trim();
            const sendEvents = Array.isArray(transition?.sendEvents)
                ? transition.sendEvents.map((eventName) => String(eventName || "").trim()).filter(Boolean)
                : [];

            return `${trigger}|${sendEvents.sort().join(",")}`;
        })
        .sort()
        .join("||");
};

export const getSharedScxmlStateId = (node) => {
    if (node?.type !== "custom") return "";

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    if (!fullSkillName) return "";

    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";

    if (skillName === "end" || skillName === "fatal") {
        return String(node.data?.scxmlStateId || skillBase).trim();
    }

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        const sentEvent = Array.isArray(node.data?.behaviorExitEvents)
            ? node.data.behaviorExitEvents.find((eventName) =>
                String(eventName || "").trim()
            )
            : "";

        return getForwardingNopScxmlStateId(node, sentEvent);
    }

    return "";
};

export const getSharedScxmlStateKey = (node) => {
    const scxmlStateId = getSharedScxmlStateId(node);
    if (!scxmlStateId) return null;

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";

    if (skillName === "end" || skillName === "fatal") {
        return `${skillName}|${scxmlStateId}`;
    }

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        return `nop-exit|${skillBase}|${getBehaviorExitSignature(node)}`;
    }

    return null;
};

export const normalizeSharedScxmlStateIdentity = (node) => {
    const sharedKey = getSharedScxmlStateKey(node);
    if (!sharedKey) return node;

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";
    const scxmlStateId = getSharedScxmlStateId(node) || skillBase;

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        const sentEvents = Array.isArray(node.data?.behaviorExitEvents)
            ? node.data.behaviorExitEvents.filter(Boolean)
            : [];

        return {
            ...node,
            data: {
                ...(node.data || {}),
                label:
                    sentEvents.length > 0
                        ? sentEvents.join(", ")
                        : node.data?.label || "Nop",
                behaviorExitScxmlStateId: scxmlStateId,
                scxmlStateId,
                // fullSkillName remains the editor-facing skill identity. The
                // shared SCXML identity is kept separately in scxmlStateId.
                fullSkillName: fullSkillName || skillBase,
            },
        };
    }

    return {
        ...node,
        data: {
            ...(node.data || {}),
            label: skillName === "end" ? "End" : "Fatal",
            scxmlStateId,
            fullSkillName: fullSkillName || skillBase,
            isFinal: true,
        },
    };
};

export const ensureSharedEditorInstanceIds = (sourceNodes = []) => {
    const usedByKey = new Map();

    sourceNodes.forEach((rawNode) => {
        const node = normalizeSharedScxmlStateIdentity(rawNode);
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return;

        const existing = String(node.data?.editorInstanceId || "").trim();
        if (!existing) return;

        if (!usedByKey.has(sharedKey)) usedByKey.set(sharedKey, new Set());
        usedByKey.get(sharedKey).add(existing);
    });

    return sourceNodes.map((rawNode) => {
        const node = normalizeSharedScxmlStateIdentity(rawNode);
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return node;

        if (!usedByKey.has(sharedKey)) usedByKey.set(sharedKey, new Set());
        const used = usedByKey.get(sharedKey);
        const existing = String(node.data?.editorInstanceId || "").trim();

        if (existing) return node;

        let index = 1;
        while (used.has(String(index))) index += 1;
        const editorInstanceId = String(index);
        used.add(editorInstanceId);

        return {
            ...node,
            data: {
                ...(node.data || {}),
                editorInstanceId,
            },
        };
    });
};

export const getExportFullSkillName = (node) => {
    const sharedScxmlStateId = getSharedScxmlStateId(node);
    if (sharedScxmlStateId) return sharedScxmlStateId;
    return String(node.data?.fullSkillName || "").trim();
};

export const prepareGraphForScxml = (sourceNodes = [], sourceEdges = []) => {
    // End, Fatal, and identical forwarding-Nop exits may appear multiple times
    // visually while representing one SCXML state. Normal skill clones are
    // editor-only aliases as well: they never become SCXML states, but incoming
    // transitions targeting a clone are remapped to the real skill state.
    const normalizedNodes = ensureSharedEditorInstanceIds(
        (sourceNodes || []).map(normalizeSharedScxmlStateIdentity)
    );

    const nodeById = new Map(
        normalizedNodes.map((node) => [node.id, node])
    );

    const skillCloneNodes = normalizedNodes.filter(
        (node) =>
            Boolean(node.data?.isSkillClone || node.data?.isStateClone) &&
            Boolean(node.data?.cloneOfNodeId) &&
            nodeById.has(node.data.cloneOfNodeId)
    );
    const skillCloneIdSet = new Set(
        skillCloneNodes.map((node) => node.id)
    );

    const sharedGroups = new Map();
    normalizedNodes.forEach((node) => {
        if (skillCloneIdSet.has(node.id)) return;

        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return;
        if (!sharedGroups.has(sharedKey)) sharedGroups.set(sharedKey, []);
        sharedGroups.get(sharedKey).push(node);
    });

    const aliasToCanonicalId = new Map();
    const clonePositionsByCanonicalId = new Map();
    // Stable visual instance ids let editor-only edge routing survive a
    // save/reload. They are meaningful only to the editor; SCXML semantics
    // still target the canonical state id.
    const visualInstanceIdByNodeId = new Map();

    // Normal skill clones explicitly point to their real node. Store their
    // visual positions in metadata on that real state so the aliases survive a
    // save/reload without becoming executable SCXML states.
    const skillClonesByOriginalId = new Map();
    skillCloneNodes.forEach((cloneNode) => {
        const originalId = cloneNode.data.cloneOfNodeId;
        aliasToCanonicalId.set(cloneNode.id, originalId);
        if (!skillClonesByOriginalId.has(originalId)) {
            skillClonesByOriginalId.set(originalId, []);
        }
        skillClonesByOriginalId.get(originalId).push(cloneNode);
    });

    skillClonesByOriginalId.forEach((clones, originalId) => {
        const original = nodeById.get(originalId);
        if (!original) return;

        const originalPosition = getAbsoluteNodePosition(
            original,
            normalizedNodes
        );
        const originalInstanceId =
            String(original.data?.editorInstanceId || "").trim() || "original";
        visualInstanceIdByNodeId.set(original.id, originalInstanceId);

        const positions = [
            {
                instanceId: originalInstanceId,
                x: Number(originalPosition.x || 0),
                y: Number(originalPosition.y || 0),
                isSkillClone: false,
                cloneType: "",
            },
            ...clones.map((cloneNode, cloneIndex) => {
                const absolutePosition = getAbsoluteNodePosition(
                    cloneNode,
                    normalizedNodes
                );
                const instanceId =
                    String(cloneNode.data?.editorInstanceId || "").trim() ||
                    `clone-${cloneIndex + 1}`;
                visualInstanceIdByNodeId.set(cloneNode.id, instanceId);
                return {
                    instanceId,
                    x: Number(absolutePosition.x || 0),
                    y: Number(absolutePosition.y || 0),
                    isSkillClone: Boolean(cloneNode.data?.isSkillClone),
                    cloneType: cloneNode.data?.isSkillClone
                        ? "skill"
                        : String(cloneNode.data?.sourceNodeType || "state"),
                };
            }),
        ];

        clonePositionsByCanonicalId.set(originalId, positions);
    });

    sharedGroups.forEach((group) => {
        const canonical = group.find((node) => !node.parentId) || group[0];
        group.forEach((node) => aliasToCanonicalId.set(node.id, canonical.id));

        clonePositionsByCanonicalId.set(
            canonical.id,
            group.map((node, index) => {
                const absolutePosition = getAbsoluteNodePosition(
                    node,
                    normalizedNodes
                );
                const instanceId =
                    String(node.data?.editorInstanceId || "").trim() ||
                    String(index + 1);
                visualInstanceIdByNodeId.set(node.id, instanceId);

                return {
                    instanceId,
                    x: Number(absolutePosition.x || 0),
                    y: Number(absolutePosition.y || 0),
                };
            })
        );
    });

    const remapNodeId = (nodeId) => aliasToCanonicalId.get(nodeId) || nodeId;
    const seenSharedStates = new Set();

    const exportNodes = normalizedNodes
        .filter((node) => {
            if (skillCloneIdSet.has(node.id)) return false;

            const sharedKey = getSharedScxmlStateKey(node);
            if (!sharedKey) return true;

            const canonicalId = aliasToCanonicalId.get(node.id);
            if (node.id !== canonicalId || seenSharedStates.has(sharedKey)) {
                return false;
            }

            seenSharedStates.add(sharedKey);
            return true;
        })
        .map((node) => ({
            ...node,
            data: {
                ...(node.data || {}),
                fullSkillName: getExportFullSkillName(node),
                editorClonePositions:
                    clonePositionsByCanonicalId.get(node.id) || undefined,
                onEntry: Array.isArray(node.data?.onEntry)
                    ? node.data.onEntry.map(normalizeAssignmentForScxml)
                    : node.data?.onEntry,
                onExit: Array.isArray(node.data?.onExit)
                    ? node.data.onExit.map(normalizeAssignmentForScxml)
                    : node.data?.onExit,
                events: Array.isArray(node.data?.events)
                    ? node.data.events
                        // Compound/Parallel border events are editor-only
                        // handles for visualizing a child skill transition at
                        // the container boundary. The semantic external edge
                        // below is already collapsed back to the real skill,
                        // so exporting these handles as container transitions
                        // would create duplicates such as
                        // compound_2.Wait.success.
                        .filter(
                            (event) =>
                                !(
                                    (node.type === "compound" ||
                                        node.type === "parallelLane") &&
                                    event?.sourceNodeId &&
                                    event?.transitionHandleId
                                )
                        )
                        .map((event) => ({
                            ...event,
                            target: event.target ? remapNodeId(event.target) : event.target,
                            assignments: Array.isArray(event.assignments)
                                ? event.assignments.map(normalizeAssignmentForScxml)
                                : event.assignments,
                            assignExpr: event.assignExpr !== undefined
                                ? normalizeAssignmentExpressionForScxml(event.assignExpr)
                                : event.assignExpr,
                        }))
                    : node.data?.events,
            },
        }));

    const seenExportEdges = new Set();
    const exportEdges = (sourceEdges || [])
        // Boundary helper edges are editor-only. The visible external edge
        // stores the real skill/event in metadata and is collapsed back to the
        // semantic transition here before SCXML generation.
        .filter(
            (edge) =>
                !edge.data?.boundaryInternalEdge &&
                !edge.data?.compoundInternalEdge &&
                !edge.data?.parallelInternalEdge &&
                !String(edge.id || "").startsWith("edge-internal-")
        )
        .map((edge) => {
            const semanticSource =
                edge.data?.boundaryOriginalSource ||
                edge.data?.compoundOriginalSource ||
                edge.data?.parallelOriginalSource ||
                edge.source;
            const semanticSourceHandle =
                edge.data?.boundaryOriginalSourceHandle ||
                edge.data?.compoundOriginalSourceHandle ||
                edge.data?.parallelOriginalSourceHandle ||
                edge.sourceHandle;
            const semanticTarget =
                edge.data?.boundaryOriginalTarget ||
                edge.data?.compoundOriginalTarget ||
                edge.data?.parallelOriginalTarget ||
                edge.target;
            const visualTargetId = [
                edge.data?.boundaryOriginalTarget,
                edge.data?.compoundOriginalTarget,
                edge.data?.parallelOriginalTarget,
                edge.target,
                semanticTarget,
            ].find((candidateId) =>
                candidateId && visualInstanceIdByNodeId.has(candidateId)
            );
            const editorTargetInstanceId = visualTargetId
                ? visualInstanceIdByNodeId.get(visualTargetId)
                : "";

            return {
                ...edge,
                source: semanticSource,
                sourceHandle: semanticSourceHandle,
                target: semanticTarget,
                data: {
                    ...(edge.data || {}),
                    ...(editorTargetInstanceId
                        ? { editorTargetInstanceId }
                        : {}),
                },
            };
        })
        // Skill clones are inbound-only editor aliases. Even if stale graph
        // data contains an outgoing clone edge, never let it affect SCXML.
        .filter((edge) => !skillCloneIdSet.has(edge.source))
        .map((edge) => ({
            ...edge,
            source: remapNodeId(edge.source),
            target: remapNodeId(edge.target),
            data: {
                ...(edge.data || {}),
                assignments: Array.isArray(edge.data?.assignments)
                    ? edge.data.assignments.map(normalizeAssignmentForScxml)
                    : edge.data?.assignments,
                assign: edge.data?.assign
                    ? normalizeAssignmentForScxml(edge.data.assign)
                    : edge.data?.assign,
                assignExpr: edge.data?.assignExpr !== undefined
                    ? normalizeAssignmentExpressionForScxml(edge.data.assignExpr)
                    : edge.data?.assignExpr,
            },
        }))
        .filter((edge) => {
            // Multiple editor aliases of one shared state collapse to one SCXML
            // target. Avoid emitting duplicate transitions after remapping.
            const transitionKey = JSON.stringify({
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle || edge.label || "",
                cond: edge.data?.cond || "",
                assignments: edge.data?.assignments || edge.data?.assign || [],
            });

            if (seenExportEdges.has(transitionKey)) return false;
            seenExportEdges.add(transitionKey);
            return true;
        });

    return { nodes: exportNodes, edges: exportEdges };
};

export const getLocalDataModelEntries = (dataModel = []) =>
    (dataModel || []).filter((parameter) => {
        const id = String(parameter?.id || "").trim();

        if (!id || id === "#_STATE_PREFIX" || id === "#_SLOTS") return false;

        // IDs beginning with "_" are inherited/global variables in the
        // Bonsai editor. Everything else belongs to this state machine's
        // local datamodel.
        return !id.startsWith("_");
    });

export const collectDescendantGlobals = (
    tabList,
    rootTabId,
    blockedGlobalIds = []
) => {
    const childrenByParent = new Map();

    (tabList || []).forEach((tab) => {
        if (!tab.parentTabId) return;

        if (!childrenByParent.has(tab.parentTabId)) {
            childrenByParent.set(tab.parentTabId, []);
        }

        childrenByParent.get(tab.parentTabId).push(tab);
    });

    const result = [];

    const visit = (parentTabId, blockedIds) => {
        const children = childrenByParent.get(parentTabId) || [];

        children.forEach((child) => {
            const childGlobals = (child.globalDataModel || []).filter(
                (parameter) =>
                    String(parameter.id || "").startsWith("_")
            );

            childGlobals.forEach((parameter) => {
                if (blockedIds.has(parameter.id)) {
                    return;
                }

                result.push({
                    ...parameter,
                    definedIn:
                        child.title ||
                        child.fileName ||
                        "Sub-state machine",
                    sourceTabId: child.id,
                });
            });

            const blockedForChildren = new Set(blockedIds);

            childGlobals.forEach((parameter) => {
                blockedForChildren.add(parameter.id);
            });

            visit(child.id, blockedForChildren);
        });
    };

    visit(rootTabId, new Set(blockedGlobalIds));

    return result;
};

