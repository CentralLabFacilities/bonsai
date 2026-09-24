import { MarkerType } from "@xyflow/react";
import { getLayoutedElements } from "./layoutUtils";
import { parseStateAssignments } from "./stateActions.js";
import { getTransitionExitToken } from "./transitionEvents.js";
import {
    deserializeScxmlConditionForEditor,
    deserializeScxmlValueForEditor,
    deserializeStateDatamodelValueForEditor,
    normalizeTypedValue,
    normalizeValueType,
} from "./valueTypes.js";
import {
    COLLAPSED_CONTAINER_HEIGHT,
    COLLAPSED_CONTAINER_WIDTH,
    COMPOUND_PADDING_X,
    getCompoundChildrenRight,
    getCompoundExitGutterWidth,
    getLaneForNode,
    isNodeInsideContainer,
} from "./editorGeometry.js";

const makeImportedSelfLoopControlPoints = () => [
    { id: `cp-${crypto.randomUUID()}`, anchor: "source", dx: 76, dy: -92 },
    { id: `cp-${crypto.randomUUID()}`, anchor: "target", dx: -76, dy: -92 },
];

const getImportedBoundaryLogicalSources = (sourceNode, sourceHandle, allNodes) => {
    if (!sourceNode || !["compound", "parallelLane"].includes(sourceNode.type)) {
        return [];
    }

    const sourceEvents = (sourceNode.data?.events || []).filter(
        (candidate) => String(candidate?.id || "") === String(sourceHandle || "")
    );
    if (sourceEvents.length === 0) return [];

    const nestedSkills = allNodes.filter((node) => {
        if (node.type !== "custom" && node.type !== "submachine") return false;
        if (node.data?.isSkillClone || node.data?.isStateClone) return false;

        return sourceNode.type === "parallelLane"
            ? getLaneForNode(node, allNodes)?.id === sourceNode.id
            : isNodeInsideContainer(node, sourceNode.id, allNodes);
    });

    /*
     * IMPORTANT: transitions declared directly on a Compound are event
     * handlers for events emitted by skills inside that Compound. For example
     *
     *   <transition event="Talk.*" target="ExecSpeech"/>
     *
     * on ExecSetup must be matched back to every nested Talk skill such as
     * dialog.Talk#setup or dialog.Talk#gripper. SCXML does not encode which
     * Talk instance emitted the event; while each instance is active it may
     * emit Talk.*. Therefore the editor must connect ALL matching nested skill
     * instances to the SAME Compound boundary transition. Do not require a
     * unique skill match here or the border transition will be rendered
     * without its internal skill -> boundary connection.
     *
     * Match by the longest available skill-name prefix rather than splitting
     * on the last dot, because exit-token ids may themselves contain dots.
     */
    const matches = [];
    sourceEvents.forEach((event) => {
        const rawEvent = String(event.rawEvent || event.name || "").trim();
        if (!rawEvent) return;

        nestedSkills.forEach((node) => {
            const fullName = String(node.data?.fullSkillName || "").trim();
            const withoutInstance = fullName.split("#")[0];
            const simpleName =
                withoutInstance.split(".").filter(Boolean).pop() || "";
            const label = String(node.data?.label || "").trim();
            const prefixes = Array.from(
                new Set(
                    [fullName, withoutInstance, simpleName, label]
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                )
            ).sort((a, b) => b.length - a.length);

            const matchedPrefix = prefixes.find(
                (prefix) => rawEvent.startsWith(`${prefix}.`)
            );
            if (!matchedPrefix) return;

            matches.push({
                logicalSourceNode: node,
                logicalHandle: getTransitionExitToken(rawEvent, matchedPrefix),
                rawEvent,
                matchedPrefix,
            });
        });
    });

    const uniqueByNodeAndHandle = new Map();
    matches.forEach((match) => {
        const key = `${match.logicalSourceNode.id}|${match.logicalHandle}`;
        const current = uniqueByNodeAndHandle.get(key);
        if (!current || match.matchedPrefix.length > current.matchedPrefix.length) {
            uniqueByNodeAndHandle.set(key, match);
        }
    });

    return [...uniqueByNodeAndHandle.values()];
};

const ensureImportedBoundarySourceHandle = (boundarySource) => {
    const logicalSourceNode = boundarySource?.logicalSourceNode;
    const logicalHandle = String(boundarySource?.logicalHandle || "").trim();
    if (!logicalSourceNode || !logicalHandle) return;

    const events = Array.isArray(logicalSourceNode.data?.events)
        ? logicalSourceNode.data.events
        : [];
    if (events.some((event) => String(event?.id || "") === logicalHandle)) {
        return;
    }

    // A compound wildcard such as Talk.* may not be part of the skill API's
    // declared ExitTokens. Add an editor-only source handle so the reconstructed
    // skill -> compound-boundary edge has a real React Flow handle to attach to.
    // It has no target of its own, so it does not create an extra SCXML
    // transition when the graph is saved.
    logicalSourceNode.data = {
        ...(logicalSourceNode.data || {}),
        events: [
            ...events,
            {
                id: logicalHandle,
                name: logicalHandle,
                rawEvent: boundarySource.rawEvent || logicalHandle,
                description: "",
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
                editorBoundarySynthetic: true,
            },
        ],
    };
};

const getImportedExitedBoundaries = (sourceNode, targetNode, allNodes) => {
    if (!sourceNode || !targetNode) return [];
    const byId = new Map(allNodes.map((node) => [node.id, node]));
    const steps = [];
    const visited = new Set();
    const seenParallelIds = new Set();
    let parentId = sourceNode.parentId;

    const targetIsInside = (container) =>
        targetNode.id === container.id ||
        isNodeInsideContainer(targetNode, container.id, allNodes);

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;

        if (parent.type === "compound") {
            // The automatically managed Compound inside a Parallel lane is
            // structural only. The visible lane is the actual transition
            // boundary, so routing through both would duplicate the same exit.
            if (parent.data?.autoParallelLaneCompound) {
                parentId = parent.parentId;
                continue;
            }
            if (!targetIsInside(parent)) {
                steps.push({ kind: "compound", anchor: parent, container: parent });
            }
        } else if (parent.type === "parallelLane") {
            const parallel = byId.get(parent.parentId);
            if (
                parallel?.type === "parallel" &&
                !seenParallelIds.has(parallel.id)
            ) {
                seenParallelIds.add(parallel.id);
                if (!targetIsInside(parallel)) {
                    steps.push({ kind: "parallel", anchor: parent, container: parallel });
                }
            }
        } else if (parent.type === "parallel") {
            seenParallelIds.add(parent.id);
        }

        parentId = parent.parentId;
    }

    return steps;
};

const materializeImportedBoundaryTransitions = (allNodes, sourceEdges) => {
    const semanticEdges = (sourceEdges || []).filter(
        (edge) => !String(edge.id || "").startsWith("edge-internal-")
    );
    const result = [];
    const boundaryEvents = new Map();

    const ensureBoundaryEvent = (anchor, exitId, label, logicalSourceNode, logicalHandle, targetId) => {
        if (!boundaryEvents.has(anchor.id)) boundaryEvents.set(anchor.id, new Map());
        boundaryEvents.get(anchor.id).set(exitId, {
            id: exitId,
            name: label,
            rawEvent: label,
            target: targetId,
            sourceNodeId: logicalSourceNode.id,
            transitionHandleId: logicalHandle,
        });
    };

    semanticEdges.forEach((edge) => {
        const sourceNode = allNodes.find((node) => node.id === edge.source);
        const targetNode = allNodes.find((node) => node.id === edge.target);
        if (!sourceNode || !targetNode) {
            result.push(edge);
            return;
        }

        const boundarySources = getImportedBoundaryLogicalSources(
            sourceNode,
            edge.sourceHandle,
            allNodes
        );
        boundarySources.forEach(ensureImportedBoundarySourceHandle);

        const primaryBoundarySource = boundarySources[0] || null;
        const logicalSourceNode =
            primaryBoundarySource?.logicalSourceNode || sourceNode;
        const logicalHandle = String(
            primaryBoundarySource?.logicalHandle ||
            edge.sourceHandle ||
            edge.label ||
            "success"
        );
        const importedRawEvent = String(
            primaryBoundarySource?.rawEvent || edge.sourceHandle || edge.label || ""
        ).trim();

        const primarySteps = getImportedExitedBoundaries(
            logicalSourceNode,
            targetNode,
            allNodes
        );

        if (primarySteps.length === 0 && boundarySources.length === 0) {
            result.push(edge);
            return;
        }

        const baseName =
            logicalSourceNode.data?.label ||
            String(logicalSourceNode.data?.fullSkillName || "state")
                .split("#")[0]
                .split(".")
                .pop();
        const exitLabel = primaryBoundarySource
            ? importedRawEvent
            : `${baseName}.${logicalHandle}`;
        // Multiple nested instances (e.g. Talk#setup and Talk#gripper) must
        // converge on one visual Compound boundary point because SCXML has one
        // compound-level <transition event="Talk.*" .../>.
        const exitId = primaryBoundarySource
            ? `imported-${sourceNode.id}-${importedRawEvent}`
            : `${logicalSourceNode.id}-${logicalHandle}`;
        const crossedKinds = new Set();
        const helperKeys = new Set();
        let currentSourceId = logicalSourceNode.id;
        let currentSourceHandle = logicalHandle;

        const sourcesToMaterialize = boundarySources.length > 0
            ? boundarySources
            : [{ logicalSourceNode, logicalHandle, rawEvent: exitLabel }];

        sourcesToMaterialize.forEach((boundarySource) => {
            const source = boundarySource.logicalSourceNode;
            const sourceHandle = String(boundarySource.logicalHandle || logicalHandle);
            const steps = getImportedExitedBoundaries(source, targetNode, allNodes);
            let pathSourceId = source.id;
            let pathSourceHandle = sourceHandle;

            steps.forEach((step) => {
                crossedKinds.add(step.kind);
                ensureBoundaryEvent(
                    step.anchor,
                    exitId,
                    exitLabel,
                    logicalSourceNode,
                    logicalHandle,
                    edge.target
                );

                const helperKey =
                    `${pathSourceId}|${pathSourceHandle}|${step.anchor.id}|${exitId}`;
                if (!helperKeys.has(helperKey)) {
                    helperKeys.add(helperKey);
                    result.push({
                        id:
                            `edge-internal-boundary-${source.id}-` +
                            `${sourceHandle}-${step.anchor.id}-${crypto.randomUUID()}`,
                        source: pathSourceId,
                        target: step.anchor.id,
                        sourceHandle: pathSourceHandle,
                        targetHandle: `target-${exitId}`,
                        type: "smoothstep",
                        selectable: false,
                        focusable: false,
                        style: {
                            strokeDasharray: "4 4",
                            stroke: "#0284c7",
                            strokeWidth: 1.5,
                        },
                        data: {
                            boundaryInternalEdge: true,
                            boundaryKind: step.kind,
                            boundaryExitId: exitId,
                            boundaryOriginalSource: source.id,
                            boundaryOriginalSourceHandle: sourceHandle,
                            ...(step.kind === "compound"
                                ? { compoundInternalEdge: true, compoundExitId: exitId }
                                : { parallelInternalEdge: true, parallelExitId: exitId }),
                        },
                    });
                }

                pathSourceId = step.anchor.id;
                pathSourceHandle = exitId;
            });

            // Use the primary path for the one semantic edge that continues
            // from the shared boundary to the outside target.
            if (source.id === logicalSourceNode.id) {
                currentSourceId = pathSourceId;
                currentSourceHandle = pathSourceHandle;
            }
        });

        // Imported legacy boundary edges can already start on the border.
        // In that case there is no containment step to materialize, but every
        // matching nested skill still needs a helper edge into the one shared
        // boundary handle.
        if (primarySteps.length === 0 && primaryBoundarySource) {
            currentSourceId = sourceNode.id;
            currentSourceHandle = exitId;
            ensureBoundaryEvent(
                sourceNode,
                exitId,
                exitLabel,
                logicalSourceNode,
                logicalHandle,
                edge.target
            );
            crossedKinds.add(sourceNode.type === "compound" ? "compound" : "parallel");

            boundarySources.forEach((boundarySource) => {
                const source = boundarySource.logicalSourceNode;
                const sourceHandle = String(boundarySource.logicalHandle || logicalHandle);
                const helperKey = `${source.id}|${sourceHandle}|${sourceNode.id}|${exitId}`;
                if (helperKeys.has(helperKey)) return;
                helperKeys.add(helperKey);

                result.push({
                    id:
                        `edge-internal-boundary-${source.id}-` +
                        `${sourceHandle}-${sourceNode.id}-${crypto.randomUUID()}`,
                    source: source.id,
                    target: sourceNode.id,
                    sourceHandle,
                    targetHandle: `target-${exitId}`,
                    type: "smoothstep",
                    selectable: false,
                    focusable: false,
                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },
                    data: {
                        boundaryInternalEdge: true,
                        boundaryKind:
                            sourceNode.type === "compound" ? "compound" : "parallel",
                        boundaryExitId: exitId,
                        boundaryOriginalSource: source.id,
                        boundaryOriginalSourceHandle: sourceHandle,
                        ...(sourceNode.type === "compound"
                            ? { compoundInternalEdge: true, compoundExitId: exitId }
                            : { parallelInternalEdge: true, parallelExitId: exitId }),
                    },
                });
            });
        }

        result.push({
            ...edge,
            source: currentSourceId,
            sourceHandle: currentSourceHandle,
            type: "smartTransition",
            label: logicalHandle,
            data: {
                ...(edge.data || {}),
                boundaryOriginalSource: logicalSourceNode.id,
                boundaryOriginalSourceHandle: logicalHandle,
                ...(boundarySources.length > 1
                    ? {
                        boundaryOriginalSources: boundarySources.map((source) => ({
                            sourceId: source.logicalSourceNode.id,
                            sourceHandle: String(source.logicalHandle),
                        })),
                    }
                    : {}),
                ...(primaryBoundarySource
                    ? { boundaryImportedRawEvent: importedRawEvent }
                    : {}),
                boundaryExitId: exitId,
                ...(crossedKinds.has("compound") || sourceNode.type === "compound"
                    ? {
                        compoundOriginalSource: logicalSourceNode.id,
                        compoundOriginalSourceHandle: logicalHandle,
                        compoundExitId: exitId,
                    }
                    : {}),
                ...(crossedKinds.has("parallel") || sourceNode.type === "parallelLane"
                    ? {
                        parallelOriginalSource: logicalSourceNode.id,
                        parallelOriginalSourceHandle: logicalHandle,
                        parallelExitId: exitId,
                    }
                    : {}),
            },
        });
    });

    boundaryEvents.forEach((eventsById, anchorId) => {
        const anchor = allNodes.find((node) => node.id === anchorId);
        if (!anchor) return;
        const replacementIds = new Set(eventsById.keys());
        const replacementRawEvents = new Set(
            [...eventsById.values()].map((event) => event.rawEvent)
        );
        const existing = (anchor.data?.events || []).filter((event) => {
            if (String(event?.id || "") === "compound-entry") return false;
            if (replacementIds.has(String(event?.id || ""))) return false;
            return !replacementRawEvents.has(String(event?.rawEvent || event?.name || ""));
        });
        const nextEvents = [...existing, ...eventsById.values()];
        anchor.data = { ...(anchor.data || {}), events: nextEvents };

        if (anchor.type === "compound") {
            const requiredWidth =
                getCompoundChildrenRight(anchor.id, allNodes) +
                COMPOUND_PADDING_X +
                getCompoundExitGutterWidth(nextEvents);
            anchor.style = {
                ...(anchor.style || {}),
                width: Math.max(Number(anchor.style?.width) || 320, requiredWidth),
            };
        }
    });

    return result;
};

const getSkillPackageName = (fullSkillName) => {
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

const parseTransitionAssignments = (transitionElement) =>
    Array.from(transitionElement?.children || [])
        .filter((child) => child.localName === "assign")
        .map((assignElement) => ({
            location: assignElement.getAttribute("location")?.trim() || "",
            expr: assignElement.getAttribute("expr")?.trim() || "",
        }))
        .filter((assignment) => assignment.location);


const getBaseStateName = (fullSkillName) =>
    String(fullSkillName || "")
        .split("#")[0]
        .split(".")
        .pop()
        .trim();

const isNamedFinalState = (fullSkillName) => {
    const name = getBaseStateName(fullSkillName).toLowerCase();
    return name === "end" || name === "fatal";
};

// In Bonsai, a sub-state machine is represented directly as
// `<state ... src="...">`. Keep this in one helper so top-level states and
// children of Compound/Parallel containers are classified consistently.
const getSubMachineSource = (stateElem) =>
    stateElem?.getAttribute?.("src")?.trim() || "";

const parseEditorPositions = (stateElem) => {
    const metadataElems = Array.from(stateElem?.children || []).filter(
        (child) => child.localName === "metadata"
    );

    if (metadataElems.length === 0) return [];

    return Array.from(metadataElems[0].children || [])
        .filter(
            (child) =>
                child.localName === "position" ||
                child.nodeName.includes("position")
        )
        .map((positionElement) => {
            const cloneType =
                positionElement.getAttribute("clone")?.trim().toLowerCase() || "";
            return {
                x: parseFloat(positionElement.getAttribute("x")),
                y: parseFloat(positionElement.getAttribute("y")),
                instanceId:
                    positionElement.getAttribute("instance")?.trim() || "",
                cloneType,
                isSkillClone: cloneType === "skill",
            };
        })
        .filter(
            (position) =>
                Number.isFinite(position.x) && Number.isFinite(position.y)
        );
};

const parseEditorEdgeTargets = (scxmlElem) => {
    const routes = [];

    Array.from(scxmlElem?.getElementsByTagName?.("*") || [])
        .filter((child) => child.localName === "edgeTarget")
        .forEach((edgeTargetElement) => {
            const eventName =
                edgeTargetElement.getAttribute("event")?.trim() || "";
            const targetStateName =
                edgeTargetElement.getAttribute("target")?.trim() || "";
            const targetInstanceId =
                edgeTargetElement.getAttribute("instance")?.trim() || "";
            const occurrence = Number.parseInt(
                edgeTargetElement.getAttribute("occurrence") || "0",
                10
            );

            if (!eventName || !targetStateName || !targetInstanceId) return;

            routes.push({
                eventName,
                targetStateName,
                targetInstanceId,
                occurrence: Number.isFinite(occurrence) ? occurrence : 0,
            });
        });

    return routes;
};

const getImportedAbsolutePosition = (node, allNodes) => {
    let x = Number(node?.position?.x || 0);
    let y = Number(node?.position?.y || 0);
    let parentId = node?.parentId;
    const visited = new Set();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = allNodes.find((candidate) => candidate.id === parentId);
        if (!parent) break;
        x += Number(parent.position?.x || 0);
        y += Number(parent.position?.y || 0);
        parentId = parent.parentId;
    }

    return { x, y };
};

const parseBehaviorExitForwarding = (stateElem, fullSkillName) => {
    if (getBaseStateName(fullSkillName).toLowerCase() !== "nop") {
        return null;
    }

    const forwardingTransitions = Array.from(stateElem?.children || [])
        .filter((child) => child.localName === "transition")
        .map((transitionElement) => {
            const target = transitionElement.getAttribute("target")?.trim();

            // A behavior-exit Nop stays inside no local target. Instead it
            // forwards exactly one event to the parent state machine. Any
            // targetless Nop transition containing <send event="..."/> is
            // therefore an outward exit, regardless of its trigger event.
            if (target) return null;

            const triggerEvent =
                transitionElement.getAttribute("event")?.trim() ||
                "Nop.fatal";

            const sendEvents = Array.from(
                transitionElement.children || []
            )
                .filter((child) => child.localName === "send")
                .map((sendElement) =>
                    sendElement.getAttribute("event")?.trim()
                )
                .filter(Boolean)
                .slice(0, 1);

            if (sendEvents.length === 0) return null;

            return {
                triggerEvent,
                sendEvents,
            };
        })
        .filter(Boolean);

    if (forwardingTransitions.length === 0) {
        return null;
    }

    const firstTransition = forwardingTransitions[0];
    const sentEvents = firstTransition?.sendEvents?.slice(0, 1) || [];

    return {
        transitions: firstTransition ? [firstTransition] : [],
        sentEvents,
        displayLabel: sentEvents[0] || "Nop",
    };
};

export const extractBehaviorExitEventsFromScxml = (xmlText) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parserError = xmlDoc.getElementsByTagName("parsererror")[0];

    if (parserError) {
        return [];
    }

    const sentEvents = [];

    Array.from(xmlDoc.getElementsByTagName("state")).forEach((stateElem) => {
        const stateId = stateElem.getAttribute("id") || "";
        const behaviorExit = parseBehaviorExitForwarding(
            stateElem,
            stateId
        );

        (behaviorExit?.sentEvents || []).forEach((eventName) => {
            if (eventName && !sentEvents.includes(eventName)) {
                sentEvents.push(eventName);
            }
        });
    });

    return sentEvents;
};

export const parseScxmlFile = async (xmlText, fetchSkillData, getNodeId) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    // 1. Prüfen auf XML-Syntaxfehler
    const parserError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parserError) {
        throw new Error("Fehler in der XML-Struktur:\n" + parserError.textContent.slice(0, 200));
    }

    const scxmlElem = xmlDoc.getElementsByTagName("scxml")[0];
    if (!scxmlElem) {
        throw new Error("Kein <scxml>-Wurzelelement gefunden.");
    }

    const initialAttr = scxmlElem.getAttribute("initial") || "";

    // 2. Globales Datamodel & Slots parsen (Originaler Code)
    const globalDataEntries = [];
    const parsedSlots = [];
    const parameterErrors = [];

    const directChildren = Array.from(scxmlElem.children);
    const editorEdgeTargets = parseEditorEdgeTargets(scxmlElem);
    const editorEdgeTargetByKey = new Map(
        editorEdgeTargets.map((route) => [
            `${route.eventName}\u0000${route.targetStateName}\u0000${route.occurrence}`,
            route.targetInstanceId,
        ])
    );
    const editorTargetInstanceByTransitionElement = new WeakMap();
    const editorTransitionOccurrenceByKey = new Map();

    Array.from(scxmlElem.getElementsByTagName("*"))
        .filter((element) => element.localName === "transition")
        .forEach((transitionElement) => {
            const eventName = transitionElement.getAttribute("event")?.trim() || "";
            const targetStateName = transitionElement.getAttribute("target")?.trim() || "";
            if (!eventName || !targetStateName) return;

            const routeKey = `${eventName}\u0000${targetStateName}`;
            const occurrence = editorTransitionOccurrenceByKey.get(routeKey) || 0;
            editorTransitionOccurrenceByKey.set(routeKey, occurrence + 1);
            const targetInstanceId = editorEdgeTargetByKey.get(
                `${routeKey}\u0000${occurrence}`
            );
            if (targetInstanceId) {
                editorTargetInstanceByTransitionElement.set(
                    transitionElement,
                    targetInstanceId
                );
            }
        });

    const rootDataModel = directChildren.find((c) => c.localName === "datamodel");

    if (rootDataModel) {
        const dataTags = Array.from(rootDataModel.children).filter((c) => c.localName === "data");
        dataTags.forEach((dataTag) => {
            const id = dataTag.getAttribute("id");
            const expr = dataTag.getAttribute("expr");

            if (id === "#_SLOTS") {
                // Slot declarations can be namespaced (e.g. <bonsai:slot> /
                // <bonsai:inheritSlot>). Match by localName so both prefixed and
                // unprefixed SCXML are handled consistently.
                const slotElements = Array.from(
                    dataTag.getElementsByTagName("*")
                ).filter(
                    (element) =>
                        element.localName === "slot" ||
                        element.localName === "inheritSlot"
                );

                slotElements.forEach((element) => {
                    const isInherited = element.localName === "inheritSlot";
                    const state = element.getAttribute("state");
                    const xpath = element.getAttribute("xpath");

                    parsedSlots.push({
                        key: element.getAttribute("key"),
                        state,
                        xpath,
                        inherited: isInherited
                            ? {
                                state,
                                xpath,
                            }
                            : null,
                    });
                });
            } else if (id) {
                globalDataEntries.push({
                    id: id,
                    expr: deserializeScxmlValueForEditor(expr || ""),
                });
            }
        });
    }

    const slotDeclarationAppliesToSkill = (slot, fullSkillName, baseSkillName) =>
        slot?.state === fullSkillName ||
        (slot?.state && fullSkillName.startsWith(slot.state + "#")) ||
        slot?.state === baseSkillName ||
        slot?.state === "*";

    const findSlotMatch = (fullSkillName, baseSkillName, slotKey) => {
        // Slot declarations in SCXML do not necessarily use the same key as the
        // concrete read/write requests returned by the configured skill. For
        // example, slots.SlotIO may declare one logical slot as "StringSlot"
        // while the skill API exposes the access requests as "Read" and
        // "Write". Resolve the declaration by state first, and only use the
        // key to disambiguate when the state has more than one declaration.
        const groups = [
            parsedSlots.filter((ps) => ps.state === fullSkillName),
            parsedSlots.filter((ps) => ps.state === baseSkillName),
            parsedSlots.filter((ps) => ps.state === "*"),
        ];

        for (const candidates of groups) {
            if (candidates.length === 0) continue;

            const exactKeyMatch = candidates.find((ps) => ps.key === slotKey);
            if (exactKeyMatch) return exactKeyMatch;

            // A single declaration for the state is unambiguous, even when the
            // configured skill exposes separate read/write request keys.
            if (candidates.length === 1) return candidates[0];

            // Multiple declarations without a matching key are ambiguous. Do
            // not guess a path, because that could connect the request to the
            // wrong logical slot.
            return undefined;
        }

        return undefined;
    };

    const mergeDeclaredSlotRequests = (configured = [], fallback = [], declaredKeys) => {
        const merged = [...(Array.isArray(configured) ? configured : [])];
        const seen = new Set(
            merged.map((slot) => `${slot?.key || ""}|${slot?.type || ""}`)
        );

        (Array.isArray(fallback) ? fallback : []).forEach((slot) => {
            if (!declaredKeys.has(slot?.key)) return;

            const identity = `${slot?.key || ""}|${slot?.type || ""}`;
            if (seen.has(identity)) return;

            seen.add(identity);
            merged.push(slot);
        });

        return merged;
    };

    // Hilfsfunktion: Vollständiges NodeData-Objekt erzeugen
    const buildSkillNodeData = async (fullSkillName, isInitial, isFinal, srcAttr, stateElem) => {
        const baseSkillName = fullSkillName.split("#")[0];
        const behaviorExit = parseBehaviorExitForwarding(
            stateElem,
            fullSkillName
        );

        // Parameter-dependent skills can expose a different set of slot
        // requests. A state's datamodel is not guaranteed to contain only
        // skill parameters, though. Sending unrelated <data> entries to the
        // configurator can make the POST fail and silently fall back to the
        // unconfigured skill, which in turn drops conditional slot requests.
        //
        // Load the base skill first to learn the real parameter keys, then send
        // only those values back to the parameterized endpoint.
        const stateDatamodelValues = {};
        const stateDataModel = Array.from(stateElem.children).find((c) => c.localName === "datamodel");
        if (stateDataModel) {
            const sDataTags = Array.from(stateDataModel.children).filter((c) => c.localName === "data");
            sDataTags.forEach((dt) => {
                const pid = dt.getAttribute("id");
                const pexpr = dt.getAttribute("expr");
                if (pid) {
                    stateDatamodelValues[pid] = deserializeStateDatamodelValueForEditor(
                        pexpr || ""
                    );
                }
            });
        }

        const baseSkillApiData = behaviorExit || srcAttr
            ? {}
            : (await fetchSkillData(baseSkillName)) || {};

        const knownParameterKeys = new Set(
            (baseSkillApiData.params || [])
                .map((param) => param?.key)
                .filter(Boolean)
        );

        const localParams = Object.fromEntries(
            Object.entries(stateDatamodelValues).filter(([key]) =>
                knownParameterKeys.size === 0 || knownParameterKeys.has(key)
            )
        );

        const hasConfiguredParameters = Object.keys(localParams).length > 0;
        let skillApiData = behaviorExit
            ? {}
            : hasConfiguredParameters
                ? (await fetchSkillData(baseSkillName, localParams)) || baseSkillApiData
                : baseSkillApiData;

        if (!behaviorExit && !srcAttr) {
            // The SCXML document is authoritative for connections that already
            // exist. If a parameterized skill response unexpectedly omits a
            // slot explicitly declared by this state, recover the request from
            // the base skill definition instead of loading a half-connected
            // slot node. This also protects older files from backend/config
            // changes while preserving the declaration stored in #_SLOTS.
            const declaredKeys = new Set(
                parsedSlots
                    .filter((slot) =>
                        slotDeclarationAppliesToSkill(
                            slot,
                            fullSkillName,
                            baseSkillName
                        )
                    )
                    .map((slot) => slot.key)
                    .filter(Boolean)
            );

            if (declaredKeys.size > 0) {
                const configuredKeys = new Set([
                    ...(skillApiData.inSlots || []).map((slot) => slot?.key),
                    ...(skillApiData.outSlots || []).map((slot) => slot?.key),
                ]);
                const hasMissingDeclaredRequest = [...declaredKeys].some(
                    (key) => !configuredKeys.has(key)
                );

                if (hasMissingDeclaredRequest) {
                    skillApiData = {
                        ...skillApiData,
                        inSlots: mergeDeclaredSlotRequests(
                            skillApiData.inSlots,
                            baseSkillApiData.inSlots,
                            declaredKeys
                        ),
                        outSlots: mergeDeclaredSlotRequests(
                            skillApiData.outSlots,
                            baseSkillApiData.outSlots,
                            declaredKeys
                        ),
                    };
                }
            }
        }

        const inSlots = (skillApiData.inSlots || []).map((s) => {
            const match = findSlotMatch(fullSkillName, baseSkillName, s.key);
            return {
                key: s.key,
                type: s.type,
                description: s.description || "",
                path: match ? match.xpath.replace(/^\//, "") : "",
                inherited: match?.inherited || null,
            };
        });

        const outSlots = (skillApiData.outSlots || []).map((s) => {
            const match = findSlotMatch(fullSkillName, baseSkillName, s.key);
            return {
                key: s.key,
                type: s.type,
                description: s.description || "",
                path: match ? match.xpath.replace(/^\//, "") : "",
                inherited: match?.inherited || null,
            };
        });

        const parameterDefinitions = Array.from(
            new Map(
                [
                    ...(baseSkillApiData.params || []),
                    ...(skillApiData.params || []),
                ]
                    .filter((param) => param?.key)
                    .map((param) => [param.key, param])
            ).values()
        );

        const parameterValidationVariables = [
            ...globalDataEntries,
            ...parameterDefinitions.map((param) => ({
                id: param.key,
                type: param.type,
                valueType: param.type,
                expr:
                    stateDatamodelValues[param.key] !== undefined
                        ? stateDatamodelValues[param.key]
                        : param.default ?? "",
            })),
        ];

        const params = parameterDefinitions.map((param) => {
            const expr =
                stateDatamodelValues[param.key] !== undefined
                    ? stateDatamodelValues[param.key]
                    : "";

            // SCXML is allowed to contain values that no longer match the
            // current skill definition (for example after a parameter type was
            // changed in the Java skill). Detect that while importing instead
            // of waiting for the user to edit the field. The graph still loads;
            // the caller receives a parameterErrors entry and the normal
            // Problems analysis keeps reporting it until the value is fixed.
            const normalizedParameterType = normalizeValueType(param.type);
            if (String(expr || "").trim() && normalizedParameterType) {
                const validation = normalizeTypedValue(
                    expr,
                    normalizedParameterType,
                    parameterValidationVariables,
                    { allowEmpty: true }
                );

                if (!validation.valid) {
                    parameterErrors.push({
                        state: fullSkillName,
                        parameter: param.key,
                        expectedType: param.type || "Unknown",
                        value: expr,
                        message: validation.error || "Invalid parameter value.",
                    });
                }
            }

            return {
                key: param.key,
                type: param.type,
                required: param.required,
                default: param.default,
                description: param.description || "",
                expr,
            };
        });

        const events = behaviorExit
            ? []
            : (skillApiData.events || []).map((event) => ({
                id: event.event,
                description: event.description || "",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
            }));

        return {
            // Keep fullSkillName unchanged so saving still produces Nop#...
            // while the editor can display the event that is sent outward.
            label:
                behaviorExit?.displayLabel ||
                fullSkillName.split(".").pop().split("#")[0],
            fullSkillName: fullSkillName,
            isInitial: isInitial,
            isFinal: isFinal || isNamedFinalState(fullSkillName),
            isBehaviorExit: Boolean(behaviorExit),
            behaviorExitEvents: behaviorExit?.sentEvents || [],
            behaviorExitTransitions:
                behaviorExit?.transitions || [],
            src: srcAttr || "",
            events: events,
            inSlots: inSlots,
            outSlots: outSlots,
            params: params,
            onEntry: parseStateAssignments(stateElem, "onentry"),
            onExit: parseStateAssignments(stateElem, "onexit"),
        };
    };

    // 3. States & Parallels parsen
    const newNodes = [];
    const newEdges = [];
    const rawTransitions = [];
    let hasCustomPositions = true;

    const appendImportedEditorClones = (
        stateElement,
        nodeData,
        sourceNodeId,
        sourceNodeType,
        parentId = null
    ) => {
        parseEditorPositions(stateElement)
            .filter((position) => Boolean(position.cloneType))
            .forEach((clonePosition) => {
                const isSkillClone = clonePosition.cloneType === "skill";
                newNodes.push({
                    id: getNodeId(),
                    position: {
                        x: clonePosition.x,
                        y: clonePosition.y,
                    },
                    type: isSkillClone ? "custom" : "stateClone",
                    ...(parentId
                        ? { parentId, extent: "parent" }
                        : {}),
                    data: {
                        label: nodeData.label,
                        fullSkillName: nodeData.fullSkillName,
                        ...(isSkillClone
                            ? { isSkillClone: true }
                            : {
                                  isStateClone: true,
                                  sourceNodeType:
                                      clonePosition.cloneType || sourceNodeType,
                              }),
                        cloneOfNodeId: sourceNodeId,
                        editorInstanceId:
                            String(clonePosition.instanceId || "").trim() || undefined,
                        isInitial: false,
                        isFinal: false,
                        events: [],
                        inSlots: [],
                        outSlots: [],
                        params: [],
                        onEntry: [],
                        onExit: [],
                    },
                });
            });
    };


    const getParallelImportMetrics = (parallelElem) => {
        const branchElements = Array.from(parallelElem.children).filter(
            (child) => child.localName === "state"
        );
        let maxStatesInAnyLane = 1;
        branchElements.forEach((branchElem) => {
            const innerStates = Array.from(branchElem.children).filter(
                (child) => child.localName === "state"
            );
            maxStatesInAnyLane = Math.max(
                maxStatesInAnyLane,
                innerStates.length > 0 ? innerStates.length : 1
            );
        });

        const hasCompoundLane = branchElements.some(
            (branchElem) =>
                Array.from(branchElem.children).some(
                    (child) => child.localName === "state"
                )
        );
        const laneHeight = hasCompoundLane ? 150 : 110;
        const headerHeight = 40;
        const width = Math.max(300, maxStatesInAnyLane * 220 + 60);
        const height = headerHeight + branchElements.length * laneHeight + 10;

        return {
            branchElements,
            laneHeight,
            headerHeight,
            width,
            height,
        };
    };

    const getDirectStateChildren = (element) =>
        Array.from(element.children).filter(
            (child) => child.localName === "state" || child.localName === "parallel"
        );

    const registerDirectTransitions = (element, nodeId, sourceSkillName) => {
        Array.from(element.children)
            .filter((child) => child.localName === "transition")
            .forEach((transitionElement) => {
                const targetState = transitionElement.getAttribute("target");
                if (!targetState) return;
                const assignments = parseTransitionAssignments(transitionElement);
                const firstAssignment = assignments[0] || null;
                rawTransitions.push({
                    sourceNodeId: nodeId,
                    sourceSkillName,
                    eventId: transitionElement.getAttribute("event") || "",
                    targetStateName: targetState,
                    editorTargetInstanceId:
                        editorTargetInstanceByTransitionElement.get(
                            transitionElement
                        ) || "",
                    cond: (transitionElement.getAttribute("cond") || "").trim(),
                    assignments,
                    assignLocation: firstAssignment?.location || "",
                    assignExpr: firstAssignment?.expr || "",
                });
            });
    };

    let appendNestedState;
    let appendNestedParallel;

    appendNestedParallel = async (
        parallelElem,
        { parentId = null, position = { x: 0, y: 0 }, isInitial = false }
    ) => {
        const fullSkillName = parallelElem.getAttribute("id") || "Parallel";
        const parallelNodeId = getNodeId();
        const branchElements = Array.from(parallelElem.children).filter(
            (child) => child.localName === "state"
        );
        const branchNames = branchElements.map((branch) =>
            branch.getAttribute("id")
        );
        const headerHeight = 40;
        const laneHeight = 180;
        const containerWidth = Math.max(420, 240 + branchElements.length * 20);
        const containerHeight =
            headerHeight + Math.max(1, branchElements.length) * laneHeight + 10;
        const editorPositions = parseEditorPositions(parallelElem);
        const primaryEditorPosition =
            editorPositions.find((editorPosition) => !editorPosition.cloneType) ||
            editorPositions[0];
        const nodePosition = primaryEditorPosition
            ? { x: primaryEditorPosition.x, y: primaryEditorPosition.y }
            : position;

        newNodes.push({
            id: parallelNodeId,
            position: nodePosition,
            ...(parentId ? { parentId, extent: "parent", expandParent: true } : {}),
            type: "parallel",
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: fullSkillName.split(".").pop().split("#")[0],
                fullSkillName,
                isInitial,
                lanes: branchNames,
                events: [],
                onEntry: parseStateAssignments(parallelElem, "onentry"),
                onExit: parseStateAssignments(parallelElem, "onexit"),
            },
        });
        appendImportedEditorClones(
            parallelElem,
            {
                label: fullSkillName.split(".").pop().split("#")[0],
                fullSkillName,
            },
            parallelNodeId,
            "parallel",
            parentId
        );

        // Keep the established parallel-boundary transition semantics: the
        // event prefix identifies the branch/lane that owns the exit. A
        // sourceNodeId of null lets the later resolver bind it by skill name,
        // while each matching lane receives its concrete boundary transition.
        const parallelTransElems = Array.from(parallelElem.children).filter(
            (child) => child.localName === "transition"
        );
        parallelTransElems.forEach((transitionElement) => {
            const eventName = transitionElement.getAttribute("event") || "";
            const targetState = transitionElement.getAttribute("target");
            if (!targetState) return;

            const sourcePrefix = eventName.includes(".")
                ? eventName.split(".")[0]
                : fullSkillName;
            const assignments = parseTransitionAssignments(transitionElement);
            const firstAssignment = assignments[0] || null;
            rawTransitions.push({
                sourceNodeId: null,
                sourceSkillName: sourcePrefix,
                eventId: eventName,
                targetStateName: targetState,
                editorTargetInstanceId:
                    editorTargetInstanceByTransitionElement.get(
                        transitionElement
                    ) || "",
                cond: (transitionElement.getAttribute("cond") || "").trim(),
                assignments,
                assignLocation: firstAssignment?.location || "",
                assignExpr: firstAssignment?.expr || "",
            });
        });

        for (let laneIdx = 0; laneIdx < branchElements.length; laneIdx++) {
            const branchElem = branchElements[laneIdx];
            const branchId = branchElem.getAttribute("id") || `Lane_${laneIdx + 1}`;
            const branchInitial = branchElem.getAttribute("initial") || "";
            const laneNodeId = getNodeId();
            const branchChildren = getDirectStateChildren(branchElem);
            const matchingTrans = parallelTransElems.filter((transitionElement) =>
                (transitionElement.getAttribute("event") || "").startsWith(
                    `${branchId}.`
                )
            );
            const laneEvents = matchingTrans.map((transitionElement) => {
                const rawEvent = transitionElement.getAttribute("event") || "";
                return {
                    id: getTransitionExitToken(rawEvent, branchId),
                    name: rawEvent,
                    rawEvent,
                    target: transitionElement.getAttribute("target"),
                };
            });

            newNodes.push({
                id: laneNodeId,
                position: { x: 0, y: headerHeight + laneIdx * laneHeight },
                parentId: parallelNodeId,
                extent: "parent",
                type: "parallelLane",
                draggable: false,
                selectable: false,
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom:
                        laneIdx < branchElements.length - 1
                            ? "1.5px solid #0284c7"
                            : "none",
                },
                data: {
                    label: branchId,
                    events: laneEvents,
                    initialChildId: branchInitial || null,
                    onEntry: parseStateAssignments(branchElem, "onentry"),
                    onExit: parseStateAssignments(branchElem, "onexit"),
                },
            });

            matchingTrans.forEach((transitionElement) => {
                const targetState = transitionElement.getAttribute("target");
                if (!targetState) return;
                const eventName = transitionElement.getAttribute("event") || "";
                const assignments = parseTransitionAssignments(transitionElement);
                const firstAssignment = assignments[0] || null;
                rawTransitions.push({
                    sourceNodeId: laneNodeId,
                    sourceSkillName: branchId,
                    eventId: eventName,
                    targetStateName: targetState,
                    editorTargetInstanceId:
                        editorTargetInstanceByTransitionElement.get(
                            transitionElement
                        ) || "",
                    cond: (transitionElement.getAttribute("cond") || "").trim(),
                    assignments,
                    assignLocation: firstAssignment?.location || "",
                    assignExpr: firstAssignment?.expr || "",
                });
            });

            // A branch state with children is represented by the lane plus its
            // real child states. This preserves semantic compounds/parallels as
            // selectable nodes instead of converting them into lane wrappers.
            if (branchChildren.length > 0) {
                let childX = 24;
                for (const childElem of branchChildren) {
                    const childId = childElem.getAttribute("id") || "";
                    const result = await appendNestedState(childElem, {
                        parentId: laneNodeId,
                        position: { x: childX, y: 35 },
                        isInitial: childId === branchInitial,
                    });
                    childX += Math.max(210, Number(result?.width) || 210) + 24;
                }
                registerDirectTransitions(branchElem, laneNodeId, branchId);
            } else {
                // A branch without child states is itself the atomic state.
                const stateSrc = getSubMachineSource(branchElem);
                const stateNodeId = getNodeId();
                const nodeData = await buildSkillNodeData(
                    branchId,
                    false,
                    false,
                    stateSrc,
                    branchElem
                );
                registerDirectTransitions(branchElem, stateNodeId, branchId);
                newNodes.push({
                    id: stateNodeId,
                    position: { x: 24, y: 35 },
                    parentId: laneNodeId,
                    extent: "parent",
                    type: stateSrc ? "submachine" : "custom",
                    data: nodeData,
                });
                appendImportedEditorClones(
                    branchElem,
                    nodeData,
                    stateNodeId,
                    stateSrc ? "submachine" : "custom",
                    laneNodeId
                );

                // Parallel-level branch exits visually terminate at the lane
                // boundary. Keep the same helper edge representation used by
                // the original importer for atomic branch states.
                laneEvents.forEach((laneEvent) => {
                    if (!nodeData.events.some((event) => event.id === laneEvent.id)) {
                        nodeData.events.push({
                            id: laneEvent.id,
                            name: laneEvent.name,
                            rawEvent: laneEvent.rawEvent,
                            target: laneNodeId,
                        });
                    }
                    newEdges.push({
                        id:
                            `edge-internal-${stateNodeId}-` +
                            `${laneEvent.id}-${laneNodeId}`,
                        source: stateNodeId,
                        target: laneNodeId,
                        sourceHandle: laneEvent.id,
                        targetHandle: `target-${laneEvent.id}`,
                        style: {
                            strokeDasharray: "4 4",
                            stroke: "#0284c7",
                            strokeWidth: 1.5,
                        },
                        type: "smoothstep",
                    });
                });
            }
        }

        return {
            nodeId: parallelNodeId,
            width: containerWidth,
            height: containerHeight,
        };
    };

    appendNestedState = async (
        stateElem,
        { parentId, position = { x: 0, y: 0 }, isInitial = false }
    ) => {
        if (stateElem.localName === "parallel") {
            return appendNestedParallel(stateElem, {
                parentId,
                position,
                isInitial,
            });
        }

        const fullSkillName = stateElem.getAttribute("id") || "State";
        const childStates = getDirectStateChildren(stateElem);

        if (childStates.length > 0) {
            const compoundNodeId = getNodeId();
            const compoundInitial = stateElem.getAttribute("initial") || "";
            const headerHeight = 45;
            const childGap = 24;
            const containerWidth = Math.max(320, 80 + childStates.length * 240);
            const containerHeight = 250;
            const parentEvents = Array.from(stateElem.children)
                .filter((child) => child.localName === "transition")
                .map((transitionElement) => {
                    const rawEvent = transitionElement.getAttribute("event") || "";
                    return {
                        id: rawEvent || "*",
                        name: rawEvent,
                        rawEvent,
                        target: transitionElement.getAttribute("target"),
                        cond: transitionElement.getAttribute("cond") || "",
                    };
                });

            newNodes.push({
                id: compoundNodeId,
                position,
                parentId,
                extent: "parent",
                expandParent: true,
                type: "compound",
                style: { width: containerWidth, height: containerHeight },
                data: {
                    label: fullSkillName.split(".").pop().split("#")[0],
                    fullSkillName,
                    isInitial,
                    initialChildId: compoundInitial || null,
                    events: parentEvents,
                    onEntry: parseStateAssignments(stateElem, "onentry"),
                    onExit: parseStateAssignments(stateElem, "onexit"),
                },
            });
            appendImportedEditorClones(
                stateElem,
                {
                    label: fullSkillName.split(".").pop().split("#")[0],
                    fullSkillName,
                },
                compoundNodeId,
                "compound",
                parentId
            );
            registerDirectTransitions(stateElem, compoundNodeId, fullSkillName);

            let childX = 24;
            for (const childElem of childStates) {
                const childId = childElem.getAttribute("id") || "";
                const result = await appendNestedState(childElem, {
                    parentId: compoundNodeId,
                    position: { x: childX, y: headerHeight + 16 },
                    isInitial: childId === compoundInitial,
                });
                childX += Math.max(210, Number(result?.width) || 210) + childGap;
            }

            return {
                nodeId: compoundNodeId,
                width: containerWidth,
                height: containerHeight,
            };
        }

        const stateNodeId = getNodeId();
        const stateSrc = getSubMachineSource(stateElem);
        const nodeData = await buildSkillNodeData(
            fullSkillName,
            isInitial,
            false,
            stateSrc,
            stateElem
        );
        registerDirectTransitions(stateElem, stateNodeId, fullSkillName);
        newNodes.push({
            id: stateNodeId,
            position,
            parentId,
            extent: "parent",
            expandParent: true,
            type: stateSrc ? "submachine" : "custom",
            data: nodeData,
        });
        appendImportedEditorClones(
            stateElem,
            nodeData,
            stateNodeId,
            stateSrc ? "submachine" : "custom",
            parentId
        );
        return { nodeId: stateNodeId, width: 210, height: 80 };
    };

    for (const stateElem of directChildren) {
        const fullSkillName = stateElem.getAttribute("id");
        if (!fullSkillName) continue;

        const isParallel = stateElem.localName === "parallel";
        const isFinal =
            stateElem.localName === "final" ||
            stateElem.getAttribute("final") === "true" ||
            isNamedFinalState(fullSkillName);
        const srcAttr = getSubMachineSource(stateElem);
        const isInitial = fullSkillName === initialAttr;

        // Position(s) aus <metadata>. Shared editor aliases (End/Fatal and
        // forwarding Nop exits) may store multiple positions for one SCXML
        // state. Normal states continue to use the first position.
        const editorPositions = parseEditorPositions(stateElem);
        const primaryEditorPosition =
            editorPositions.find((position) => !position.cloneType) ||
            editorPositions[0];
        let x = primaryEditorPosition?.x ?? null;
        let y = primaryEditorPosition?.y ?? null;

        if (x === null || !Number.isFinite(x) || y === null || !Number.isFinite(y)) {
            hasCustomPositions = false;
            x = 0;
            y = 0;
        }

        // ==========================================
        // FALL A: PARALLEL STATE
        // ==========================================
        if (isParallel) {
            await appendNestedParallel(stateElem, {
                position: { x, y },
                isInitial,
            });
            continue;
        }

        // ==========================================
        // FALL B: COMPOUND STATE
        // ==========================================
        const childStates = Array.from(stateElem.children).filter(
            (child) =>
                child.localName === "state" || child.localName === "parallel"
        );
        const isCompound = !isParallel && childStates.length > 0;

        if (isCompound) {
            const compoundNodeId = getNodeId();
            const compoundInitial = stateElem.getAttribute("initial") || "";

            const headerHeight = 45;
            const childGap = 20;
            const childFootprints = childStates.map((child) =>
                child.localName === "parallel"
                    ? getParallelImportMetrics(child)
                    : { width: 210, height: 80 }
            );
            const contentWidth = childFootprints.reduce(
                (sum, footprint) => sum + footprint.width,
                0
            );
            const containerWidth = Math.max(
                260,
                40 + contentWidth + childGap * Math.max(0, childStates.length - 1)
            );
            const containerHeight =
                headerHeight +
                20 +
                Math.max(80, ...childFootprints.map((footprint) => footprint.height)) +
                20;

            // 1. Parent-Level Transitions auslesen
            const parentTransitionElems = Array.from(stateElem.children).filter((c) => c.localName === "transition");
            const parentEvents = parentTransitionElems.map((tr) => {
                const rawEvent = tr.getAttribute("event") || "";

                /*
                 * IMPORTANT: A transition declared on a Compound belongs to a
                 * nested skill event, not to the Compound name itself. For
                 * example, `Talk.*` on `ExecSetup` must first be matched to the
                 * `dialog.Talk#...` skill inside ExecSetup. Do NOT normalize
                 * `Talk.*` with getTransitionExitToken(..., "ExecSetup") here:
                 * doing so turns every `SomeSkill.*` transition into the same
                 * `*` handle and makes it impossible to identify which nested
                 * skill must connect to the Compound boundary. Keep the raw
                 * event as the temporary Compound handle; after matching, the
                 * child-side handle is normalized correctly (e.g. to `*`).
                 */
                const handleId = rawEvent || "*";

                return {
                    id: handleId,
                    name: rawEvent,
                    rawEvent: rawEvent,
                    target: tr.getAttribute("target"),
                    cond: tr.getAttribute("cond") || "",
                };
            });

            // 2. Compound Frame Node anlegen
            newNodes.push({
                id: compoundNodeId,
                position: { x, y },
                type: "compound",
                style: { width: containerWidth, height: containerHeight },
                data: {
                    label: fullSkillName.split(".").pop().split("#")[0],
                    fullSkillName: fullSkillName,
                    isInitial: isInitial,
                    events: parentEvents, // Wichtig für die Handles im CompoundNode
                    onEntry: parseStateAssignments(stateElem, "onentry"),
                    onExit: parseStateAssignments(stateElem, "onexit"),
                },
            });
            appendImportedEditorClones(
                stateElem,
                {
                    label: fullSkillName.split(".").pop().split("#")[0],
                    fullSkillName,
                },
                compoundNodeId,
                "compound"
            );

            // 2. Transitions auf Compound-Ebene erfassen (z.B. Fallbacks wie Succeeder.*)
            Array.from(stateElem.children)
                .filter((c) => c.localName === "transition")
                .forEach((tr) => {
                    const eventName = tr.getAttribute("event") || "";
                    const targetState = tr.getAttribute("target");
                    const cond = tr.getAttribute("cond") || "";
                    const assignments = parseTransitionAssignments(tr);
                    const firstAssignment = assignments[0] || null;

                    if (targetState) {
                        rawTransitions.push({
                            sourceNodeId: compoundNodeId,
                            sourceSkillName: fullSkillName,
                            eventId: eventName,
                            targetStateName: targetState,
                            editorTargetInstanceId:
                                editorTargetInstanceByTransitionElement.get(tr) || "",
                            cond: cond.trim(),
                            assignments,
                            assignLocation: firstAssignment?.location || "",
                            assignExpr: firstAssignment?.expr || "",
                        });
                    }
                });

            // 4. Recursively import child compounds/parallels/atomic states.
            let childX = 20;
            for (let i = 0; i < childStates.length; i++) {
                const childElem = childStates[i];
                const childId = childElem.getAttribute("id") || "";
                const result = await appendNestedState(childElem, {
                    parentId: compoundNodeId,
                    position: { x: childX, y: headerHeight + 10 },
                    isInitial: childId === compoundInitial,
                });
                childX += Math.max(210, Number(result?.width) || 210) + childGap;
            }
            continue;
        }

        // ==========================================
        // FALL C: REGULÄRER ATOMIC STATE / SUBMACHINE / INIT
        // ==========================================
        const innerState = stateElem.querySelector(":scope > state");
        const effectiveElem = innerState || stateElem;
        const effectiveSkillName = effectiveElem.getAttribute("id") || fullSkillName;
        const nodeId = getNodeId();

        const transitionElements = [
            ...Array.from(stateElem.children).filter((c) => c.localName === "transition"),
            ...(innerState ? Array.from(innerState.children).filter((c) => c.localName === "transition") : []),
        ];

        transitionElements.forEach((tr) => {
            const eventName = tr.getAttribute("event") || "";
            const targetState = tr.getAttribute("target");
            const cond = tr.getAttribute("cond") || "";
            const assignments = parseTransitionAssignments(tr);
            const firstAssignment = assignments[0] || null;

            if (targetState) {
                rawTransitions.push({
                    sourceNodeId: nodeId,
                    sourceSkillName: effectiveSkillName,
                    eventId: eventName,
                    targetStateName: targetState,
                    editorTargetInstanceId:
                        editorTargetInstanceByTransitionElement.get(tr) || "",
                    cond: cond.trim(),
                    assignments,
                    assignLocation: firstAssignment?.location || "",
                    assignExpr: firstAssignment?.expr || "",
                });
            }
        });

        const nodeData = await buildSkillNodeData(
            effectiveSkillName,
            isInitial,
            isFinal,
            srcAttr,
            effectiveElem
        );

        const isSharedEditorState =
            !srcAttr &&
            (isNamedFinalState(effectiveSkillName) || nodeData.isBehaviorExit);

        if (isSharedEditorState) {
            const clonePositions = editorPositions.length > 0
                ? editorPositions
                : [{ x, y, instanceId: "1" }];

            clonePositions.forEach((clonePosition, cloneIndex) => {
                const cloneNodeId = cloneIndex === 0 ? nodeId : getNodeId();
                const editorInstanceId =
                    String(clonePosition.instanceId || "").trim() ||
                    String(cloneIndex + 1);

                newNodes.push({
                    id: cloneNodeId,
                    position: {
                        x: clonePosition.x,
                        y: clonePosition.y,
                    },
                    type: "custom",
                    data: {
                        ...nodeData,
                        isInitial: Boolean(nodeData.isInitial && cloneIndex === 0),
                        scxmlStateId: effectiveSkillName,
                        editorInstanceId,
                        ...(nodeData.isBehaviorExit
                            ? { behaviorExitScxmlStateId: effectiveSkillName }
                            : {}),
                    },
                });
            });
        } else {
            newNodes.push({
                id: nodeId,
                position: { x, y },
                type: srcAttr ? "submachine" : "custom",
                data: nodeData,
            });

            // Normal skill clones are stored only as editor metadata. They are
            // visual inbound aliases of the real state and therefore do not
            // get their own SCXML state or outgoing transition data.
            appendImportedEditorClones(
                stateElem,
                nodeData,
                nodeId,
                srcAttr ? "submachine" : "custom"
            );
        }
    }

    // Editor representation: @ is a visual marker for variable references.
    // SCXML omits it in conditions and <assign> expressions, so restore it
    // after parsing and before the transition data is copied into the UI.
    rawTransitions.forEach((transition) => {
        transition.cond = deserializeScxmlConditionForEditor(transition.cond);
        const assignments = Array.isArray(transition.assignments)
            ? transition.assignments
            : transition.assignLocation
                ? [
                    {
                        location: transition.assignLocation,
                        expr: transition.assignExpr || "",
                    },
                ]
                : [];

        transition.assignments = assignments.map((assignment) => ({
            location: assignment.location,
            expr: deserializeScxmlValueForEditor(assignment.expr),
        }));
        transition.assignLocation = transition.assignments[0]?.location || "";
        transition.assignExpr = transition.assignments[0]?.expr || "";
    });

    newNodes.forEach((node) => {
        (node.data?.events || []).forEach((event) => {
            event.cond = deserializeScxmlConditionForEditor(event.cond);
            event.assignExpr = deserializeScxmlValueForEditor(event.assignExpr);
        });
    });

    // 4. Edges und Node-Events mit exakter Struktur aufbauen

    rawTransitions.forEach((trans) => {
        // Quellknoten zuerst bestimmen. Wenn ein SCXML-Ziel mehrere visuelle
        // Aliase besitzt, wird anschließend der räumlich nächste Alias gewählt.
        const sourceNode = trans.sourceNodeId
            ? newNodes.find((n) => n.id === trans.sourceNodeId)
            : newNodes.find(
                (n) =>
                    n.data.fullSkillName === trans.sourceSkillName ||
                    n.data.scxmlStateId === trans.sourceSkillName ||
                    n.data.label === trans.sourceSkillName ||
                    (n.data.fullSkillName && n.data.fullSkillName.startsWith(trans.sourceSkillName))
            );

        if (!sourceNode) return;

        const targetCandidates = newNodes.filter(
            (n) =>
                n.data.scxmlStateId === trans.targetStateName ||
                n.data.fullSkillName === trans.targetStateName ||
                n.data.label === trans.targetStateName ||
                n.id === trans.targetStateName
        );

        if (targetCandidates.length === 0) return;

        const sourcePosition = getImportedAbsolutePosition(
            sourceNode,
            newNodes
        );

        const persistedTargetInstanceId = String(
            trans.editorTargetInstanceId || ""
        ).trim();
        const persistedTargetNode = persistedTargetInstanceId
            ? targetCandidates.find(
                (candidate) =>
                    String(candidate.data?.editorInstanceId || "").trim() ===
                    persistedTargetInstanceId
            ) ||
              (persistedTargetInstanceId === "original"
                  ? targetCandidates.find(
                      (candidate) => !candidate.data?.cloneOfNodeId
                  )
                  : null)
            : null;

        const targetNode = persistedTargetNode || (targetCandidates.length === 1
            ? targetCandidates[0]
            : targetCandidates.reduce((closest, candidate) => {
                const candidatePosition = getImportedAbsolutePosition(
                    candidate,
                    newNodes
                );
                const dx = candidatePosition.x - sourcePosition.x;
                const dy = candidatePosition.y - sourcePosition.y;
                const distanceSquared = dx * dx + dy * dy;

                if (!closest || distanceSquared < closest.distanceSquared) {
                    return { candidate, distanceSquared };
                }

                return closest;
            }, null)?.candidate);

        if (!targetNode) return;

        const isFromCompound = sourceNode.type === "compound";

        // Compound-level SCXML transitions such as `Talk.*` are temporary
        // boundary declarations. Keep their complete raw event until
        // materializeImportedBoundaryTransitions() has matched `Talk` to the
        // actual nested skill. Normalizing against the Compound name here
        // would collapse `Talk.*`, `MoveToStart.*`, etc. all to `*`.
        const eventHandleId = isFromCompound
            ? String(trans.eventId || "*").trim() || "*"
            : getTransitionExitToken(
                trans.eventId,
                sourceNode.data.fullSkillName || trans.sourceSkillName
            );
        const hasCond = Boolean(trans.cond && trans.cond.trim() !== "");
        const labelText = isFromCompound
            ? (hasCond ? `[${trans.cond}]` : "")
            : (hasCond ? `${eventHandleId} [${trans.cond}]` : eventHandleId);

        const edgeId = `edge-${sourceNode.id}-${eventHandleId}-${targetNode.id}-${crypto.randomUUID()}`;

        // Kante anlegen
        newEdges.push({
            id: edgeId,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: eventHandleId,
            targetHandle:
                targetNode.type === "compound" ||
                targetNode.type === "parallel" ||
                targetNode.type === "parallelLane"
                    ? null
                    : "transition-target",
            type: sourceNode.id === targetNode.id ? "smoothstep" : "default",
            label: labelText,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: {
                cond: trans.cond || "",
                ...(sourceNode.id === targetNode.id
                    ? { controlPoints: makeImportedSelfLoopControlPoints() }
                    : {}),
                assignments: Array.isArray(trans.assignments)
                    ? trans.assignments.map((assignment) => ({
                        location: assignment.location,
                        expr: assignment.expr,
                    }))
                    : [],
                assign: trans.assignments?.[0]
                    ? {
                        location: trans.assignments[0].location,
                        expr: trans.assignments[0].expr,
                    }
                    : null,
            },
        });

        // Merge the SCXML transition into the API-defined ExitToken so
        // static metadata such as the description is preserved.
        const transitionData = {
            name: trans.eventId,
            rawEvent: trans.eventId,
            selectedPackage: getSkillPackageName(
                targetNode.data.fullSkillName
            ),
            selectedSkill: targetNode.data.fullSkillName
                ? targetNode.data.fullSkillName.split("#")[0]
                : "",
            target: targetNode.id,
            cond: trans.cond || "",
            assignments: Array.isArray(trans.assignments)
                ? trans.assignments.map((assignment) => ({
                    location: assignment.location,
                    expr: assignment.expr,
                }))
                : [],
            assignLocation: trans.assignments?.[0]?.location || "",
            assignExpr: trans.assignments?.[0]?.expr || "",
        };

        // Reuse an API event which has not been assigned to a transition yet.
        // If the same ExitToken has multiple conditional transitions, create an
        // additional event entry while copying its static metadata.
        const unusedEvent = sourceNode.data.events.find(
            (event) => event.id === eventHandleId && !event.target
        );

        if (unusedEvent) {
            Object.assign(unusedEvent, transitionData);
        } else {
            const baseEvent = sourceNode.data.events.find(
                (event) => event.id === eventHandleId
            );

            sourceNode.data.events.push({
                ...(baseEvent || {}),
                id: eventHandleId,
                description: baseEvent?.description || "",
                ...transitionData,
            });
        }
    });

    // A state carrying `src` is always a Sub-SM in the editor. Keep this final
    // normalization as an invariant so nested import branches cannot
    // accidentally leave a Sub-SM rendered as a normal skill.
    const normalizedImportedNodes = newNodes.map((node) =>
        node.data?.src && node.type !== "submachine"
            ? { ...node, type: "submachine" }
            : node
    );

    // Recreate visual Compound/Parallel boundary exit points from the
    // semantic SCXML transitions. The helper edges remain editor-only and are
    // collapsed again by prepareGraphForScxml on save.
    let finalNodes = normalizedImportedNodes;
    let finalEdges = materializeImportedBoundaryTransitions(
        normalizedImportedNodes,
        newEdges
    );

    // 5. Automatisches Dagre-Layouting (Dagre nutzt exakt berechnete Maße)

    if (!hasCustomPositions && finalNodes.length > 0) {
        const topLevelNodes = finalNodes.filter((n) => !n.parentId);

        const topLevelEdgesForDagre = finalEdges
            .map((edge) => {
                const sourceNode = finalNodes.find((n) => n.id === edge.source);
                const targetNode = finalNodes.find((n) => n.id === edge.target);

                const effectiveSourceId = sourceNode?.parentId || edge.source;
                const effectiveTargetId = targetNode?.parentId || edge.target;

                if (effectiveSourceId !== effectiveTargetId) {
                    return {
                        source: effectiveSourceId,
                        target: effectiveTargetId,
                    };
                }
                return null;
            })
            .filter(Boolean);

        const layouted = getLayoutedElements(topLevelNodes, topLevelEdgesForDagre);

        topLevelNodes.forEach((tlNode) => {
            const match = layouted.nodes.find((ln) => ln.id === tlNode.id);
            if (match) {
                tlNode.position = match.position;
            }
        });
    }

    // Compound and Parallel states start collapsed after import. The complete
    // hierarchy, transitions and child geometry remain loaded in memory; only
    // the React Flow footprint/rendering is compact until the user expands the
    // container. Preserve the fully calculated size so expansion is immediate
    // and does not need to re-run child layout merely to recover dimensions.
    //
    // autoParallelLaneCompound is an editor-only structural wrapper for a
    // Parallel branch, not a user-facing Compound state. Leave it expanded so
    // expanding the surrounding Parallel immediately reveals its lane content.
    finalNodes = finalNodes.map((node) => {
        const shouldCollapseByDefault =
            (node.type === "compound" || node.type === "parallel") &&
            !node.data?.autoParallelLaneCompound;

        if (!shouldCollapseByDefault) return node;

        const expandedWidth =
            Number(node.width) ||
            Number(node.style?.width) ||
            Number(node.measured?.width) ||
            (node.type === "compound" ? 320 : 420);
        const expandedHeight =
            Number(node.height) ||
            Number(node.style?.height) ||
            Number(node.measured?.height) ||
            (node.type === "compound" ? 220 : 295);

        return {
            ...node,
            width: COLLAPSED_CONTAINER_WIDTH,
            height: COLLAPSED_CONTAINER_HEIGHT,
            style: {
                ...(node.style || {}),
                width: COLLAPSED_CONTAINER_WIDTH,
                height: COLLAPSED_CONTAINER_HEIGHT,
                minHeight: COLLAPSED_CONTAINER_HEIGHT,
            },
            data: {
                ...(node.data || {}),
                isCollapsed: true,
                expandedContainerSize: {
                    width: expandedWidth,
                    height: expandedHeight,
                    minHeight: node.style?.minHeight ?? null,
                },
            },
        };
    });

    return {
        nodes: finalNodes,
        edges: finalEdges,
        globalDataModel: globalDataEntries,
        parameterErrors,
    };
};