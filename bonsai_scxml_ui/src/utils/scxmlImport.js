import { MarkerType } from "@xyflow/react";
import { getLayoutedElements } from "./layoutUtils";
import { parseStateAssignments } from "./stateActions.js";
import { getTransitionExitToken } from "./transitionEvents.js";
import {
    deserializeScxmlConditionForEditor,
    deserializeScxmlValueForEditor,
    deserializeStateDatamodelValueForEditor,
} from "./valueTypes.js";

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

const parseBehaviorExitForwarding = (stateElem, fullSkillName) => {
    if (getBaseStateName(fullSkillName).toLowerCase() !== "nop") {
        return null;
    }

    const forwardingTransitions = Array.from(stateElem?.children || [])
        .filter((child) => child.localName === "transition")
        .map((transitionElement) => {
            const target = transitionElement.getAttribute("target")?.trim();

            // A behavior-exit Nop stays inside no local target. Instead it
            // forwards one or more events to the parent state machine. Any
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
                .filter(Boolean);

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

    const sentEvents = Array.from(
        new Set(
            forwardingTransitions.flatMap(
                (transition) => transition.sendEvents
            )
        )
    );

    return {
        transitions: forwardingTransitions,
        sentEvents,
        displayLabel:
            sentEvents.length === 1
                ? sentEvents[0]
                : sentEvents.join(", "),
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
                const slotTags = dataTag.getElementsByTagName("slot");
                Array.from(slotTags).forEach((sn) => {
                    parsedSlots.push({
                        key: sn.getAttribute("key"),
                        state: sn.getAttribute("state"),
                        xpath: sn.getAttribute("xpath"),
                    });
                });
                const inheritSlotTags = dataTag.getElementsByTagName("inheritSlot");
                Array.from(inheritSlotTags).forEach((sn) => {
                    parsedSlots.push({
                        key: sn.getAttribute("key"),
                        state: sn.getAttribute("state"),
                        xpath: sn.getAttribute("xpath"),
                        inherited: {
                            state: sn.getAttribute("state"),
                            xpath: sn.getAttribute("xpath"),
                        },
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

    const findSlotMatch = (fullSkillName, baseSkillName, slotKey) => {
        const candidates = parsedSlots.filter((ps) => ps.key === slotKey);
        if (candidates.length === 0) return undefined;

        // Priorität (von spezifisch zu allgemein):
        // 1) exakter State-Match (z.B. "slots.SlotIO#1")
        // 2) State ist ein Instanz-Präfix von fullSkillName (z.B. "Skill" für "Skill#3")
        // 3) State entspricht dem Basis-Skill-Namen ohne Instanznummer
        // 4) Wildcard "*"
        return (
            candidates.find((ps) => ps.state === fullSkillName) ||
            candidates.find((ps) => fullSkillName.startsWith(ps.state + "#")) ||
            candidates.find((ps) => ps.state === baseSkillName) ||
            candidates.find((ps) => ps.state === "*")
        );
    };

    // Hilfsfunktion: Vollständiges NodeData-Objekt erzeugen
    const buildSkillNodeData = async (fullSkillName, isInitial, isFinal, srcAttr, stateElem) => {
        const baseSkillName = fullSkillName.split("#")[0];
        const behaviorExit = parseBehaviorExitForwarding(
            stateElem,
            fullSkillName
        );
        const skillApiData = behaviorExit
            ? {}
            : (await fetchSkillData(baseSkillName)) || {};

        const localParams = {};
        const stateDataModel = Array.from(stateElem.children).find((c) => c.localName === "datamodel");
        if (stateDataModel) {
            const sDataTags = Array.from(stateDataModel.children).filter((c) => c.localName === "data");
            sDataTags.forEach((dt) => {
                const pid = dt.getAttribute("id");
                const pexpr = dt.getAttribute("expr");
                if (pid) {
                    localParams[pid] = deserializeStateDatamodelValueForEditor(
                        pexpr || ""
                    );
                }
            });
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

        const params = (skillApiData.params || []).map((param) => ({
            key: param.key,
            type: param.type,
            required: param.required,
            default: param.default,
            description: param.description || "",
            expr: localParams[param.key] !== undefined ? localParams[param.key] : "",
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

    for (const stateElem of directChildren) {
        const fullSkillName = stateElem.getAttribute("id");
        if (!fullSkillName) continue;

        const isParallel = stateElem.localName === "parallel";
        const isFinal =
            stateElem.localName === "final" ||
            stateElem.getAttribute("final") === "true" ||
            isNamedFinalState(fullSkillName);
        const srcAttr = stateElem.getAttribute("src");
        const isInitial = fullSkillName === initialAttr;

        // Position aus <metadata>
        let x = null;
        let y = null;
        const metadataElems = Array.from(stateElem.children).filter((c) => c.localName === "metadata");
        if (metadataElems.length > 0) {
            const posTag = Array.from(metadataElems[0].children).find(
                (c) => c.localName === "position" || c.nodeName.includes("position")
            );
            if (posTag) {
                x = parseFloat(posTag.getAttribute("x"));
                y = parseFloat(posTag.getAttribute("y"));
            }
        }
        if (x === null || isNaN(x) || y === null || isNaN(y)) {
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
                            events: [],
                            onEntry: parseStateAssignments(branchElem, "onentry"),
                            onExit: parseStateAssignments(branchElem, "onexit"),
                        },
                    });

                    for (let sIdx = 0; sIdx < innerStates.length; sIdx++) {
                        const stElem = innerStates[sIdx];
                        const stId = stElem.getAttribute("id");
                        const stNodeId = getNodeId();

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

                        const nodeData = await buildSkillNodeData(stId, false, false, "", stElem);
                        newNodes.push({
                            id: stNodeId,
                            position: { x: 15 + sIdx * 180, y: 35 },
                            parentId: compoundNodeId,
                            extent: "parent",
                            type: "custom",
                            data: nodeData,
                        });
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

                    const nodeData = await buildSkillNodeData(stId, false, false, "", branchElem);

                    newNodes.push({
                        id: stNodeId,
                        position: { x: 20, y: 25 },
                        parentId: laneNodeId,
                        extent: "parent",
                        type: "custom",
                        data: nodeData,
                    });

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

                const nodeData = await buildSkillNodeData(csId, isSubInitial, false, "", csElem);

                newNodes.push({
                    id: csNodeId,
                    position: { x: 20 + i * 220, y: headerHeight + 10 },
                    parentId: compoundNodeId,
                    extent: "parent",
                    type: "custom",
                    data: nodeData,
                });
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

        newNodes.push({
            id: nodeId,
            position: { x, y },
            type: srcAttr ? "submachine" : "custom",
            data: nodeData,
        });
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
        // Zielknoten finden
        const targetNode = newNodes.find(
            (n) =>
                n.data.fullSkillName === trans.targetStateName ||
                n.data.label === trans.targetStateName ||
                n.id === trans.targetStateName
        );

        // Quellknoten finden (entweder über ID oder über SkillName/Prefix)
        const sourceNode = trans.sourceNodeId
            ? newNodes.find((n) => n.id === trans.sourceNodeId)
            : newNodes.find(
                (n) =>
                    n.data.fullSkillName === trans.sourceSkillName ||
                    n.data.label === trans.sourceSkillName ||
                    (n.data.fullSkillName && n.data.fullSkillName.startsWith(trans.sourceSkillName))
            );

        if (!targetNode || !sourceNode) return;

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

    // 5. Automatisches Dagre-Layouting (Dagre nutzt exakt berechnete Maße)
    let finalNodes = newNodes;
    let finalEdges = newEdges;

    if (!hasCustomPositions && newNodes.length > 0) {
        const topLevelNodes = newNodes.filter((n) => !n.parentId);

        const topLevelEdgesForDagre = newEdges
            .map((edge) => {
                const sourceNode = newNodes.find((n) => n.id === edge.source);
                const targetNode = newNodes.find((n) => n.id === edge.target);

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