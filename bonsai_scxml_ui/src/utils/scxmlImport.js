import { MarkerType } from "@xyflow/react";
import { getLayoutedElements } from "./layoutUtils";

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
            } else if (id) {
                globalDataEntries.push({
                    id: id,
                    expr: expr || "",
                });
            }
        });
    }

    const findSlotMatch = (fullSkillName, baseSkillName, slotKey) => {
        return parsedSlots.find((ps) => {
            if (ps.key !== slotKey) return false;
            if (ps.state === "*") return true;
            if (ps.state === fullSkillName) return true;
            if (ps.state === baseSkillName) return true;
            if (fullSkillName.startsWith(ps.state + "#")) return true;
            return false;
        });
    };

    // Hilfsfunktion: Vollständiges NodeData-Objekt erzeugen
    const buildSkillNodeData = async (fullSkillName, isInitial, isFinal, srcAttr, stateElem) => {
        const baseSkillName = fullSkillName.split("#")[0];
        const skillApiData = (await fetchSkillData(baseSkillName)) || {};

        const localParams = {};
        const stateDataModel = Array.from(stateElem.children).find((c) => c.localName === "datamodel");
        if (stateDataModel) {
            const sDataTags = Array.from(stateDataModel.children).filter((c) => c.localName === "data");
            sDataTags.forEach((dt) => {
                const pid = dt.getAttribute("id");
                const pexpr = dt.getAttribute("expr");
                if (pid) localParams[pid] = pexpr;
            });
        }

        const inSlots = (skillApiData.inSlots || []).map((s) => {
            const match = findSlotMatch(fullSkillName, baseSkillName, s.key);
            return {
                key: s.key,
                type: s.type,
                path: match ? match.xpath.replace(/^\//, "") : "",
            };
        });

        const outSlots = (skillApiData.outSlots || []).map((s) => {
            const match = findSlotMatch(fullSkillName, baseSkillName, s.key);
            return {
                key: s.key,
                type: s.type,
                path: match ? match.xpath.replace(/^\//, "") : "",
            };
        });

        const params = (skillApiData.params || []).map((param) => ({
            key: param.key,
            type: param.type,
            required: param.required,
            default: param.default,
            expr: localParams[param.key] !== undefined ? localParams[param.key] : "",
        }));

        return {
            label: fullSkillName.split(".").pop().split("#")[0],
            fullSkillName: fullSkillName,
            isInitial: isInitial,
            isFinal: isFinal,
            src: srcAttr || "",
            events: [],
            inSlots: inSlots,
            outSlots: outSlots,
            params: params,
        };
    };

    // 3. States & Parallels parsen
    const newNodes = [];
    const rawTransitions = [];
    let hasCustomPositions = true;

    for (const stateElem of directChildren) {
        const fullSkillName = stateElem.getAttribute("id");
        if (!fullSkillName) continue;

        const isParallel = stateElem.localName === "parallel";
        const isFinal = stateElem.localName === "final" || stateElem.getAttribute("final") === "true";
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

            // 1. Zähle die maximale Anzahl an hintereinanderliegenden States über alle Lanes
            let maxStatesInAnyLane = 1;
            branchElements.forEach((branchElem) => {
                const innerStates = Array.from(branchElem.children).filter((c) => c.localName === "state");
                const count = innerStates.length > 0 ? innerStates.length : 1;
                if (count > maxStatesInAnyLane) maxStatesInAnyLane = count;
            });

            // 2. Kompakte Dimensionen exakt berechnen
            const laneHeight = 110;
            const headerHeight = 40;
            const containerWidth = Math.max(260, maxStatesInAnyLane * 200 + 40);
            const containerHeight = headerHeight + branchElements.length * laneHeight;

            // 3. Parallel Container-Knoten anlegen
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
                },
            });

            // 4. Transitions auf Parallel-Ebene erfassen
            Array.from(stateElem.children)
                .filter((c) => c.localName === "transition")
                .forEach((tr) => {
                    const eventName = tr.getAttribute("event") || "";
                    const targetState = tr.getAttribute("target");
                    const cond = tr.getAttribute("cond") || "";
                    const assignElem = Array.from(tr.children).find((c) => c.localName === "assign");

                    const sourcePrefix = eventName.includes(".") ? eventName.split(".")[0] : fullSkillName;

                    if (targetState) {
                        rawTransitions.push({
                            sourceNodeId: null,
                            sourceSkillName: sourcePrefix,
                            eventId: eventName,
                            targetStateName: targetState,
                            cond: cond.trim(),
                            assignLocation: assignElem?.getAttribute("location")?.trim() || "",
                            assignExpr: assignElem?.getAttribute("expr")?.trim() || "",
                        });
                    }
                });

            // 5. Kind-Knoten kompakt in den Lanes platzieren
            for (let laneIdx = 0; laneIdx < branchElements.length; laneIdx++) {
                const branchElem = branchElements[laneIdx];
                const innerStateElements = Array.from(branchElem.children).filter((c) => c.localName === "state");
                const statesToCreate = innerStateElements.length > 0 ? innerStateElements : [branchElem];

                for (let stateIdx = 0; stateIdx < statesToCreate.length; stateIdx++) {
                    const stElem = statesToCreate[stateIdx];
                    const stId = stElem.getAttribute("id");
                    const stNodeId = getNodeId();

                    Array.from(stElem.children)
                        .filter((c) => c.localName === "transition")
                        .forEach((tr) => {
                            const eventName = tr.getAttribute("event") || "";
                            const targetState = tr.getAttribute("target");
                            const cond = tr.getAttribute("cond") || "";
                            const assignElem = Array.from(tr.children).find((c) => c.localName === "assign");

                            if (targetState) {
                                rawTransitions.push({
                                    sourceNodeId: stNodeId,
                                    sourceSkillName: stId,
                                    eventId: eventName,
                                    targetStateName: targetState,
                                    cond: cond.trim(),
                                    assignLocation: assignElem?.getAttribute("location")?.trim() || "",
                                    assignExpr: assignElem?.getAttribute("expr")?.trim() || "",
                                });
                            }
                        });

                    const nodeData = await buildSkillNodeData(stId, false, false, "", stElem);

                    newNodes.push({
                        id: stNodeId,
                        // Zentriert in der jeweiligen Lane platzieren
                        position: { x: 20 + stateIdx * 200, y: headerHeight + 15 + laneIdx * laneHeight },
                        parentId: parallelNodeId,
                        extent: "parent",
                        type: "custom",
                        data: nodeData,
                    });
                }
            }
            continue;
        }

        // ==========================================
        // FALL B: REGULÄRER STATE / SUBMACHINE / INIT
        // ==========================================
        const innerState = stateElem.querySelector(":scope > state");
        const effectiveElem = innerState || stateElem;
        const effectiveSkillName = effectiveElem.getAttribute("id") || fullSkillName;
        const nodeId = getNodeId();

        // Transitions erfassen
        const transitionElements = [
            ...Array.from(stateElem.children).filter((c) => c.localName === "transition"),
            ...(innerState ? Array.from(innerState.children).filter((c) => c.localName === "transition") : []),
        ];

        transitionElements.forEach((tr) => {
            const eventName = tr.getAttribute("event") || "";
            const targetState = tr.getAttribute("target");
            const cond = tr.getAttribute("cond") || "";
            const assignElem = Array.from(tr.children).find((c) => c.localName === "assign");

            if (targetState) {
                rawTransitions.push({
                    sourceNodeId: nodeId,
                    sourceSkillName: effectiveSkillName,
                    eventId: eventName,
                    targetStateName: targetState,
                    cond: cond.trim(),
                    assignLocation: assignElem?.getAttribute("location")?.trim() || "",
                    assignExpr: assignElem?.getAttribute("expr")?.trim() || "",
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

    // 4. Edges und Node-Events mit exakter Struktur aufbauen
    const newEdges = [];

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

        const isWildcard = trans.eventId === "*" || trans.eventId.endsWith(".*");
        const eventHandleId = isWildcard
            ? (trans.eventId.split(".*")[0].split(".").pop() || "success")
            : (trans.eventId.split(".").pop() || trans.eventId);

        const edgeId = `edge-${sourceNode.id}-${eventHandleId}-${targetNode.id}-${crypto.randomUUID()}`;
        const hasCond = Boolean(trans.cond && trans.cond.trim() !== "");
        const labelText = hasCond ? `${eventHandleId} [${trans.cond}]` : eventHandleId;

        // Kante anlegen
        newEdges.push({
            id: edgeId,
            source: sourceNode.id,
            target: targetNode.id,
            sourceHandle: eventHandleId,
            targetHandle: null,
            label: labelText,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: {
                cond: trans.cond || "",
                assign: trans.assignLocation
                    ? { location: trans.assignLocation, expr: trans.assignExpr }
                    : null,
            },
        });

        // Event-Eintrag im Quell-Knoten für DetailsPanel & ConditionModal
        sourceNode.data.events.push({
            id: eventHandleId,
            selectedPackage: targetNode.data.fullSkillName ? targetNode.data.fullSkillName.split(".")[0] : "",
            selectedSkill: targetNode.data.fullSkillName ? targetNode.data.fullSkillName.split("#")[0] : "",
            target: targetNode.id,
            cond: trans.cond || "",
            assignLocation: trans.assignLocation || "",
            assignExpr: trans.assignExpr || "",
        });
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