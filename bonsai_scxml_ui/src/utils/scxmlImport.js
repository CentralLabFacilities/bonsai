import { MarkerType } from "@xyflow/react";
import { getLayoutedElements } from "./layoutUtils";
import { parseStateAssignments } from "./stateActions.js";
import { getTransitionExitToken } from "./transitionEvents.js";
import {
    deserializeScxmlConditionForEditor,
    deserializeScxmlValueForEditor,
    deserializeStateDatamodelValueForEditor,
} from "./valueTypes.js";
import {
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

const getImportedBoundaryLogicalSource = (sourceNode, sourceHandle, allNodes) => {
    if (!sourceNode || !["compound", "parallelLane"].includes(sourceNode.type)) {
        return null;
    }

    const event = (sourceNode.data?.events || []).find(
        (candidate) => String(candidate?.id || "") === String(sourceHandle || "")
    );
    if (!event) return null;

    const rawEvent = String(event.rawEvent || event.name || "").trim();
    const separatorIndex = rawEvent.lastIndexOf(".");
    if (separatorIndex <= 0) return null;

    const skillName = rawEvent.slice(0, separatorIndex);
    const transitionHandleId = rawEvent.slice(separatorIndex + 1) || sourceHandle;
    const candidates = allNodes.filter((node) => {
        if (node.type !== "custom" && node.type !== "submachine") return false;
        const full = String(node.data?.fullSkillName || "");
        const label = String(node.data?.label || "");
        const matches =
            full === skillName ||
            full.split("#")[0] === skillName ||
            full.split("#")[0].split(".").pop() === skillName ||
            label === skillName;
        if (!matches) return false;

        return sourceNode.type === "parallelLane"
            ? getLaneForNode(node, allNodes)?.id === sourceNode.id
            : isNodeInsideContainer(node, sourceNode.id, allNodes);
    });

    if (candidates.length !== 1) return null;
    return {
        logicalSourceNode: candidates[0],
        logicalHandle: transitionHandleId,
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

        const boundarySource = getImportedBoundaryLogicalSource(
            sourceNode,
            edge.sourceHandle,
            allNodes
        );
        const logicalSourceNode = boundarySource?.logicalSourceNode || sourceNode;
        const logicalHandle = String(
            boundarySource?.logicalHandle || edge.sourceHandle || edge.label || "success"
        );
        const steps = getImportedExitedBoundaries(
            logicalSourceNode,
            targetNode,
            allNodes
        );

        if (steps.length === 0 && !boundarySource) {
            result.push(edge);
            return;
        }

        const baseName =
            logicalSourceNode.data?.label ||
            String(logicalSourceNode.data?.fullSkillName || "state")
                .split("#")[0]
                .split(".")
                .pop();
        const exitLabel = `${baseName}.${logicalHandle}`;
        const exitId = `${logicalSourceNode.id}-${logicalHandle}`;
        let currentSourceId = logicalSourceNode.id;
        let currentSourceHandle = logicalHandle;
        const crossedKinds = new Set();

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
            result.push({
                id:
                    `edge-internal-boundary-${logicalSourceNode.id}-` +
                    `${logicalHandle}-${step.anchor.id}-${crypto.randomUUID()}`,
                source: currentSourceId,
                target: step.anchor.id,
                sourceHandle: currentSourceHandle,
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
                    boundaryOriginalSource: logicalSourceNode.id,
                    boundaryOriginalSourceHandle: logicalHandle,
                    ...(step.kind === "compound"
                        ? { compoundInternalEdge: true, compoundExitId: exitId }
                        : { parallelInternalEdge: true, parallelExitId: exitId }),
                },
            });
            currentSourceId = step.anchor.id;
            currentSourceHandle = exitId;
        });

        // Imported legacy parallel edges may already start on the lane border.
        // If no new step was required, keep that border as the visual source
        // but migrate its handle to the unique skill.event exit point.
        if (steps.length === 0 && boundarySource) {
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
            result.push({
                id:
                    `edge-internal-boundary-${logicalSourceNode.id}-` +
                    `${logicalHandle}-${sourceNode.id}-${crypto.randomUUID()}`,
                source: logicalSourceNode.id,
                target: sourceNode.id,
                sourceHandle: logicalHandle,
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
                    boundaryKind: sourceNode.type === "compound" ? "compound" : "parallel",
                    boundaryExitId: exitId,
                    boundaryOriginalSource: logicalSourceNode.id,
                    boundaryOriginalSourceHandle: logicalHandle,
                    ...(sourceNode.type === "compound"
                        ? { compoundInternalEdge: true, compoundExitId: exitId }
                        : { parallelInternalEdge: true, parallelExitId: exitId }),
                },
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

    const directChildren = Array.from(scxmlElem.children);
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

        const params = parameterDefinitions.map((param) => ({
            key: param.key,
            type: param.type,
            required: param.required,
            default: param.default,
            description: param.description || "",
            expr:
                stateDatamodelValues[param.key] !== undefined
                    ? stateDatamodelValues[param.key]
                    : "",
        }));

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
        sourceNodeType
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
            const parallelNodeId = getNodeId();
            const branchElements = Array.from(stateElem.children).filter((c) => c.localName === "state");
            const branchNames = branchElements.map((b) => b.getAttribute("id"));

            const parallelTransElems = Array.from(stateElem.children).filter((c) => c.localName === "transition");

            let maxStatesInAnyLane = 1;
            branchElements.forEach((branchElem) => {
                const innerStates = Array.from(branchElem.children).filter((c) => c.localName === "state");
                const count = innerStates.length > 0 ? innerStates.length : 1;
                if (count > maxStatesInAnyLane) maxStatesInAnyLane = count;
            });

            const hasCompoundLane = branchElements.some(
                (b) => Array.from(b.children).filter((c) => c.localName === "state").length > 0
            );
            const laneHeight = hasCompoundLane ? 150 : 110;
            const headerHeight = 40;
            const containerWidth = Math.max(300, maxStatesInAnyLane * 220 + 60);
            const containerHeight = headerHeight + branchElements.length * laneHeight + 10;

            // 1. Parallel Container-Knoten
            newNodes.push({
                id: parallelNodeId,
                position: { x, y },
                type: "parallel",
                style: { width: containerWidth, height: containerHeight },
                data: {
                    label: fullSkillName.split(".").pop().split("#")[0],
                    fullSkillName: fullSkillName,
                    isInitial: isInitial,
                    lanes: branchNames,
                    events: [],
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
                parallelNodeId,
                "parallel"
            );

            // 2. Transitions auf Parallel-Ebene erfassen
            parallelTransElems.forEach((tr) => {
                const eventName = tr.getAttribute("event") || "";
                const targetState = tr.getAttribute("target");
                const cond = tr.getAttribute("cond") || "";
                const assignments = parseTransitionAssignments(tr);
                const firstAssignment = assignments[0] || null;

                const sourcePrefix = eventName.includes(".") ? eventName.split(".")[0] : fullSkillName;

                if (targetState) {
                    rawTransitions.push({
                        sourceNodeId: null,
                        sourceSkillName: sourcePrefix,
                        eventId: eventName,
                        targetStateName: targetState,
                        cond: cond.trim(),
                        assignments,
                        assignLocation: firstAssignment?.location || "",
                        assignExpr: firstAssignment?.expr || "",
                    });
                }
            });

            // 3. Jede Lane als Container anlegen
            for (let laneIdx = 0; laneIdx < branchElements.length; laneIdx++) {
                const branchElem = branchElements[laneIdx];
                const branchId = branchElem.getAttribute("id");
                const branchInitial = branchElem.getAttribute("initial") || "";
                const innerStates = Array.from(branchElem.children).filter((c) => c.localName === "state");
                const laneNodeId = getNodeId();

                // Jetzt existiert parallelTransElems
                const matchingTrans = parallelTransElems.filter((tr) =>
                    (tr.getAttribute("event") || "").startsWith(`${branchId}.`)
                );

                const laneEvents = matchingTrans.map((tr) => {
                    const rawEvent = tr.getAttribute("event") || "";
                    const handleId = getTransitionExitToken(rawEvent, branchId);
                    return {
                        id: handleId,
                        name: rawEvent,
                        rawEvent: rawEvent,
                        target: tr.getAttribute("target"),
                    };
                });

                // Echter Lane-Container
                newNodes.push({
                    id: laneNodeId,
                    position: { x: 0, y: headerHeight + laneIdx * laneHeight },
                    parentId: parallelNodeId,
                    extent: "parent",
                    type: "parallelLane",
                    style: {
                        width: containerWidth,
                        height: laneHeight,
                        borderBottom: laneIdx < branchElements.length - 1 ? "1.5px solid #0284c7" : "none",
                    },
                    data: {
                        label: branchId,
                        events: laneEvents,
                    },
                });

                // Transitions nach außen registrieren (starten NUR an laneNodeId)
                matchingTrans.forEach((tr) => {
                    const eventName = tr.getAttribute("event") || "";
                    const targetState = tr.getAttribute("target");
                    const cond = tr.getAttribute("cond") || "";
                    const assignments = parseTransitionAssignments(tr);
                    const firstAssignment = assignments[0] || null;

                    if (targetState) {
                        rawTransitions.push({
                            sourceNodeId: laneNodeId,
                            sourceSkillName: branchId,
                            eventId: eventName,
                            targetStateName: targetState,
                            cond: cond.trim(),
                            assignments,
                            assignLocation: firstAssignment?.location || "",
                            assignExpr: firstAssignment?.expr || "",
                        });
                    }
                });

                // FALL A1: Lane ist ein Compound (z.B. TalkPart)
                if (innerStates.length > 0) {
                    const compoundNodeId = getNodeId();
                    const compoundWidth = Math.max(220, innerStates.length * 190 + 30);

                    newNodes.push({
                        id: compoundNodeId,
                        position: { x: 20, y: 10 },
                        parentId: laneNodeId,
                        extent: "parent",
                        type: "compound",
                        style: { width: compoundWidth, height: laneHeight - 20 },
                        data: {
                            label: branchId.split(".").pop().split("#")[0],
                            fullSkillName: branchId,
                            isInitial: false,
                            // This node represents the Parallel branch state in
                            // SCXML, but the Parallel lane is its visible editor
                            // boundary. Keep it structural so boundary exits are
                            // materialized only once at the lane border.
                            autoParallelLaneCompound: true,
                            events: [],
                            onEntry: parseStateAssignments(branchElem, "onentry"),
                            onExit: parseStateAssignments(branchElem, "onexit"),
                        },
                    });

                    for (let sIdx = 0; sIdx < innerStates.length; sIdx++) {
                        const stElem = innerStates[sIdx];
                        const stId = stElem.getAttribute("id");
                        const stNodeId = getNodeId();
                        const isSubInitial = stId === branchInitial;

                        Array.from(stElem.children)
                            .filter((c) => c.localName === "transition")
                            .forEach((tr) => {
                                const eventName = tr.getAttribute("event") || ""; // <-- Hat gefehlt!
                                const targetState = tr.getAttribute("target");
                                const cond = tr.getAttribute("cond") || "";
                                const assignments = parseTransitionAssignments(tr);
                                const firstAssignment = assignments[0] || null;

                                if (targetState) {
                                    rawTransitions.push({
                                        sourceNodeId: stNodeId,
                                        sourceSkillName: stId,
                                        eventId: eventName,
                                        targetStateName: targetState,
                                        cond: cond.trim(),
                                        assignments,
                                        assignLocation: firstAssignment?.location || "",
                                        assignExpr: firstAssignment?.expr || "",
                                    });
                                }
                            });

                        const stSrc = getSubMachineSource(stElem);
                        const nodeData = await buildSkillNodeData(
                            stId,
                            isSubInitial,
                            false,
                            stSrc,
                            stElem
                        );
                        const childType = stSrc ? "submachine" : "custom";
                        newNodes.push({
                            id: stNodeId,
                            position: { x: 15 + sIdx * 180, y: 35 },
                            parentId: compoundNodeId,
                            extent: "parent",
                            type: childType,
                            data: nodeData,
                        });
                        appendImportedEditorClones(
                            stElem,
                            nodeData,
                            stNodeId,
                            childType
                        );
                    }
                }
                // FALL A2: Lane ist ein einfacher State (z.B. Wait)
                else {
                    const stId = branchElem.getAttribute("id");
                    const stNodeId = getNodeId();

                    Array.from(branchElem.children)
                        .filter((c) => c.localName === "transition")
                        .forEach((tr) => {
                            const eventName = tr.getAttribute("event") || "";
                            const targetState = tr.getAttribute("target");
                            const cond = tr.getAttribute("cond") || "";
                            const assignments = parseTransitionAssignments(tr);
                            const firstAssignment = assignments[0] || null;

                            if (targetState) {
                                rawTransitions.push({
                                    sourceNodeId: stNodeId,
                                    sourceSkillName: stId,
                                    eventId: eventName,
                                    targetStateName: targetState,
                                    cond: cond.trim(),
                                    assignments,
                                    assignLocation: firstAssignment?.location || "",
                                    assignExpr: firstAssignment?.expr || "",
                                });
                            }
                        });

                    const stSrc = getSubMachineSource(branchElem);
                    const nodeData = await buildSkillNodeData(
                        stId,
                        false,
                        false,
                        stSrc,
                        branchElem
                    );
                    const childType = stSrc ? "submachine" : "custom";

                    newNodes.push({
                        id: stNodeId,
                        position: { x: 20, y: 25 },
                        parentId: laneNodeId,
                        extent: "parent",
                        type: childType,
                        data: nodeData,
                    });
                    appendImportedEditorClones(
                        branchElem,
                        nodeData,
                        stNodeId,
                        childType
                    );

                    // Verbindung von Wait zum Lane-Rand herstellen (nur 1x)
                    laneEvents.forEach((levt) => {
                        if (!nodeData.events.some((ev) => ev.id === levt.id)) {
                            nodeData.events.push({
                                id: levt.id,
                                name: levt.name,
                                rawEvent: levt.rawEvent,
                                target: laneNodeId,
                            });
                        }

                        newEdges.push({
                            id: `edge-internal-${stNodeId}-${levt.id}-${laneNodeId}`,
                            source: stNodeId,
                            target: laneNodeId,
                            sourceHandle: levt.id,
                            targetHandle: `target-${levt.id}`,
                            style: { strokeDasharray: "4 4", stroke: "#0284c7", strokeWidth: 1.5 },
                            type: "smoothstep",
                        });
                    });
                }
            }

            continue;
        }

        // ==========================================
        // FALL B: COMPOUND STATE
        // ==========================================
        const childStates = Array.from(stateElem.children).filter((c) => c.localName === "state");
        const isCompound = !isParallel && childStates.length > 0;

        if (isCompound) {
            const compoundNodeId = getNodeId();
            const compoundInitial = stateElem.getAttribute("initial") || "";

            const headerHeight = 45;
            const containerWidth = Math.max(260, childStates.length * 220 + 40);
            const containerHeight = headerHeight + 110;

            // 1. Parent-Level Transitions auslesen
            const parentTransitionElems = Array.from(stateElem.children).filter((c) => c.localName === "transition");
            const parentEvents = parentTransitionElems.map((tr) => {
                const rawEvent = tr.getAttribute("event") || "";
                const handleId = getTransitionExitToken(rawEvent, fullSkillName);

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
                            cond: cond.trim(),
                            assignments,
                            assignLocation: firstAssignment?.location || "",
                            assignExpr: firstAssignment?.expr || "",
                        });
                    }
                });

            // 4. Sub-States als vollwertige, normale Skills in den Kasten setzen
            for (let i = 0; i < childStates.length; i++) {
                const csElem = childStates[i];
                const csId = csElem.getAttribute("id");
                const csNodeId = getNodeId();
                const isSubInitial = csId === compoundInitial;

                // Transitions des Sub-States
                Array.from(csElem.children)
                    .filter((c) => c.localName === "transition")
                    .forEach((tr) => {
                        const eventName = tr.getAttribute("event") || "";
                        const targetState = tr.getAttribute("target");
                        const cond = tr.getAttribute("cond") || "";
                        const assignments = parseTransitionAssignments(tr);
                        const firstAssignment = assignments[0] || null;

                        if (targetState) {
                            rawTransitions.push({
                                sourceNodeId: csNodeId,
                                sourceSkillName: csId,
                                eventId: eventName,
                                targetStateName: targetState,
                                cond: cond.trim(),
                                assignments,
                                assignLocation: firstAssignment?.location || "",
                                assignExpr: firstAssignment?.expr || "",
                            });
                        }
                    });

                const csSrc = getSubMachineSource(csElem);
                const nodeData = await buildSkillNodeData(
                    csId,
                    isSubInitial,
                    false,
                    csSrc,
                    csElem
                );
                const childType = csSrc ? "submachine" : "custom";

                newNodes.push({
                    id: csNodeId,
                    position: { x: 20 + i * 220, y: headerHeight + 10 },
                    parentId: compoundNodeId,
                    extent: "parent",
                    type: childType,
                    data: nodeData,
                });
                appendImportedEditorClones(
                    csElem,
                    nodeData,
                    csNodeId,
                    childType
                );
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

        const targetNode = targetCandidates.length === 1
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
            }, null)?.candidate;

        if (!targetNode) return;

        const eventHandleId = getTransitionExitToken(
            trans.eventId,
            sourceNode.data.fullSkillName || trans.sourceSkillName
        );

        const isFromCompound = sourceNode.type === "compound";
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

    return { nodes: finalNodes, edges: finalEdges, globalDataModel: globalDataEntries };
};