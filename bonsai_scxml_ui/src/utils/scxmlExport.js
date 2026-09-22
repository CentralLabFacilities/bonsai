import { getConfiguredAssignments } from "./stateActions.js";
import { getScxmlTransitionEvent } from "./transitionEvents.js";
import {
    serializeEditorConditionForScxml,
    serializeEditorValueForScxml,
} from "./valueTypes.js";

const escapeXmlAttribute = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const buildEditorMetadataXml = (node, indent, isLane) => {
    if (isLane) return "";

    const clonePositions = Array.isArray(node.data?.editorClonePositions)
        ? node.data.editorClonePositions
        : [];

    const positionLines = clonePositions.length > 0
        ? clonePositions.map((position, index) => {
            const x = Math.round(Number(position?.x || 0));
            const y = Math.round(Number(position?.y || 0));
            const instanceId = String(position?.instanceId || "").trim();
            const instanceAttr = instanceId
                ? ` instance="${escapeXmlAttribute(instanceId)}"`
                : "";
            const cloneType = String(
                position?.cloneType || (position?.isSkillClone ? "skill" : "")
            ).trim();
            const cloneAttr = cloneType
                ? ` clone="${escapeXmlAttribute(cloneType)}"`
                : "";

            return `${indent}        <editor:position${instanceAttr}${cloneAttr} x="${x}" y="${y}"/>`;
        })
        : [
            `${indent}        <editor:position x="${Math.round(node.position?.x || 0)}" y="${Math.round(node.position?.y || 0)}"/>`,
        ];

    return `${indent}    <metadata>\n${positionLines.join("\n")}\n${indent}    </metadata>`;
};

/**
 * Generiert den SCXML-Code-String inklusive <metadata> Positionen, Slots,
 * Sub-State-Machines und Condition/Assign-Transitions.
 */
export const generateXmlString = (nodes, edgesOrDataModel = [], maybeDataModel = [], extraSlotDeclarations = []) => {
    if (!nodes || nodes.length === 0) return "";

    // Parameter-Flexibilität (edges vs. globalDataModel)
    const edges = Array.isArray(edgesOrDataModel) && edgesOrDataModel.length > 0 && edgesOrDataModel[0]?.source
        ? edgesOrDataModel
        : [];
    const globalDataModel = edges.length > 0
        ? (Array.isArray(maybeDataModel) ? maybeDataModel : [])
        : (Array.isArray(edgesOrDataModel) ? edgesOrDataModel : []);

    // 1. Initial Node ermitteln
    const topLevelNodes = nodes.filter((n) => !n.parentId);
    const initialNode = topLevelNodes.find((n) => n.data?.isInitial) || topLevelNodes[0];
    const initialId = initialNode ? initialNode.data.fullSkillName || initialNode.data.label : "";

    // 2. Slots sammeln
    const slotEntries = [];
    const seenSlotKeys = new Set();
    nodes.forEach((node) => {
        const skillName = node.data.fullSkillName || node.data.label;
        const allSlots = [...(node.data.inSlots || []), ...(node.data.outSlots || [])];

        allSlots.forEach((slot) => {
            if (!slot.path || slot.path.trim() === "") return;

                    const formattedPath = slot.path.startsWith("/") ? slot.path : `/${slot.path}`;
                    const tagName = slot.inherited ? "inheritSlot" : "slot";

                    // Bei inheritSlot referenziert `state`/`xpath` die ursprüngliche
                    // Deklaration (kann von der aktuellen Node abweichen), sonst geht
                    // beim nächsten Import/Export-Zyklus die Herkunft verloren.
                    const declaredState = slot.inherited?.state || skillName;
                    const declaredPath = slot.inherited?.xpath
                        ? (slot.inherited.xpath.startsWith("/") ? slot.inherited.xpath : `/${slot.inherited.xpath}`)
                        : formattedPath;

                    const dedupeKey = `${tagName}|${slot.key}|${declaredState}|${declaredPath}`;
                    if (seenSlotKeys.has(dedupeKey)) return;
                    seenSlotKeys.add(dedupeKey);

                    slotEntries.push(
                        `                <${tagName} key="${slot.key}" state="${declaredState}" xpath="${declaredPath}"/>`
                    );
        });
    });

    // Preserve workflow-level declarations which are not attached to a local
    // skill. This is required for slots that only exist to satisfy a sourced
    // sub-state-machine's <inheritSlot>.
    (extraSlotDeclarations || []).forEach((slot) => {
        const key = String(slot?.key || "").trim();
        const state = String(
            slot?.inherited?.state || slot?.state || ""
        ).trim();
        const rawPath = String(
            slot?.inherited?.xpath || slot?.path || ""
        ).trim();

        // Manually created visual-only slots do not necessarily have enough
        // SCXML information (key/state) to form a declaration. Linked skill
        // slots are already exported from node metadata above.
        if (!key || !state || !rawPath) return;

        const declaredPath = rawPath.startsWith("/")
            ? rawPath
            : `/${rawPath}`;
        const tagName =
            slot?.slotKind === "inheritSlot" || slot?.inherited
                ? "inheritSlot"
                : "slot";
        const dedupeKey = `${tagName}|${key}|${state}|${declaredPath}`;

        if (seenSlotKeys.has(dedupeKey)) return;
        seenSlotKeys.add(dedupeKey);

        slotEntries.push(
            `                <${tagName} key="${key}" state="${state}" xpath="${declaredPath}"/>`
        );
    });

    const slotsXml = slotEntries.length > 0
        ? `        <data id="#_SLOTS">\n            <slots>\n${slotEntries.join("\n")}\n            </slots>\n        </data>`
        : "";

    // 3. Globales Datamodel
    const globalDataLines = (globalDataModel || []).map((d) => {
        const expr = serializeEditorValueForScxml(d.expr);
        return `        <data id="${escapeXmlAttribute(d.id)}" expr="${escapeXmlAttribute(expr)}"/>`;
    });
    if (slotsXml) {
        globalDataLines.splice(1, 0, slotsXml);
    }
    const globalDataXml = globalDataLines.join("\n");

    const isDescendantOf = (childNodeId, ancestorNodeId) => {
        let current = nodes.find((n) => n.id === childNodeId);
        while (current && current.parentId) {
            if (current.parentId === ancestorNodeId) return true;
            current = nodes.find((n) => n.id === current.parentId);
        }
        return false;
    };

    const buildStateActionXml = (actionName, assignments, indent) => {
        const configuredAssignments = getConfiguredAssignments(assignments);
        if (configuredAssignments.length === 0) return "";

        const assignmentLines = configuredAssignments.map((assignment) => {
            const location = String(assignment.location).trim().replace(/^@/, "");
            const expr = serializeEditorValueForScxml(assignment.expr);

            return `${indent}    <assign location="${escapeXmlAttribute(location)}" expr="${escapeXmlAttribute(expr)}"/>`;
        });

        return `${indent}<${actionName}>\n${assignmentLines.join("\n")}\n${indent}</${actionName}>`;
    };

    // 4. Transitions ermitteln & formatieren
    const buildTransitionsXml = (node, indent, containerParentId = null) => {
        const connectedEdges = edges.filter(
            (e) => e.source === node.id && !e.id.startsWith("edge-internal-")
        );
        const nodeEvents = (node.data?.events || []).filter((ev) => ev.target);

        const combinedTransitions = [];

        connectedEdges.forEach((edge) => {
            const targetNode = nodes.find((n) => n.id === edge.target);
            const targetId = targetNode
                ? targetNode.data.fullSkillName || targetNode.data.label
                : edge.target;

            const rawHandle = edge.sourceHandle || edge.label || "success";
            const cond = edge.data?.cond || "";
            const assignments = Array.isArray(edge.data?.assignments)
                ? edge.data.assignments
                : edge.data?.assign?.location
                    ? [edge.data.assign]
                    : [];

            combinedTransitions.push({
                rawEvent: rawHandle,
                targetId,
                targetNodeId: edge.target,
                cond,
                assignments,
            });
        });

        nodeEvents.forEach((ev) => {
            const targetNode = nodes.find((n) => n.id === ev.target);
            const targetId = targetNode
                ? targetNode.data.fullSkillName || targetNode.data.label
                : ev.target;

            const alreadyExists = combinedTransitions.some(
                (ct) => ct.targetId === targetId && (ct.rawEvent === ev.id || ct.rawEvent === ev.name)
            );

            if (!alreadyExists) {
                combinedTransitions.push({
                    rawEvent: ev.rawEvent || ev.name || ev.id,
                    targetId,
                    targetNodeId: ev.target,
                    cond: ev.cond || "",
                    assignments: Array.isArray(ev.assignments)
                        ? ev.assignments
                        : ev.assignLocation
                            ? [
                                {
                                    location: ev.assignLocation,
                                    expr: ev.assignExpr || "",
                                },
                            ]
                            : [],
                });
            }
        });


        const filteredTransitions = combinedTransitions.filter((tr) => {
            if (!containerParentId) return true;
            return isDescendantOf(tr.targetNodeId, containerParentId);
        });

        const rawState = node.data?.label || node.data?.fullSkillName || "";
        const skillBaseName = rawState.split("#")[0].split(".").pop();

        return filteredTransitions
            .map((tr) => {
                const eventName = getScxmlTransitionEvent(
                    tr.rawEvent,
                    skillBaseName
                );

                const scxmlCondition = serializeEditorConditionForScxml(tr.cond);
                const condAttr = scxmlCondition
                    ? ` cond="${escapeXmlAttribute(scxmlCondition)}"`
                    : "";

                const assignments = (tr.assignments || []).filter(
                    (assignment) => assignment?.location && assignment?.expr !== undefined
                );

                if (assignments.length > 0) {
                    const assignmentLines = assignments.map((assignment) => {
                        const assignLocation = String(assignment.location)
                            .trim()
                            .replace(/^@/, "");
                        const assignExpr = serializeEditorValueForScxml(
                            assignment.expr
                        );

                        return `${indent}    <assign location="${escapeXmlAttribute(assignLocation)}" expr="${escapeXmlAttribute(assignExpr)}"/>`;
                    });

                    return `${indent}<transition event="${eventName}" target="${tr.targetId}"${condAttr}>\n${assignmentLines.join("\n")}\n${indent}</transition>`;
                }
                return `${indent}<transition event="${eventName}" target="${tr.targetId}"${condAttr}/>`;
            })
            .join("\n");
    };

    // 5. Rekursives Rendern der Knoten
    const renderNode = (node, depth = 1, currentContainerId = null) => {
        const indent = "    ".repeat(depth);
        const skillId = node.data.fullSkillName || node.data.label;
        const isParallel = node.type === "parallel";
        const isCompound = node.type === "compound";
        const isContainer = isParallel || isCompound;
        const isLane = node.type === "parallelLane";
        const isSubMachine = Boolean(node.data?.src);
        const isFinal = node.data?.isFinal || skillId.toLowerCase() === "end" || skillId.toLowerCase() === "fatal";

        const children = nodes.filter((n) => n.parentId === node.id);

        const legacyOnEntryAssignments = (node.data.params || []).filter(
            (parameter) => parameter.location && parameter.expr
        );
        const onEntryAssignments = Array.isArray(node.data?.onEntry)
            ? node.data.onEntry
            : legacyOnEntryAssignments;
        const onExitAssignments = Array.isArray(node.data?.onExit)
            ? node.data.onExit
            : [];
        const onentryBlock = buildStateActionXml("onentry", onEntryAssignments, indent + "    ");
        const onexitBlock = buildStateActionXml("onexit", onExitAssignments, indent + "    ");
        const metadataXml = buildEditorMetadataXml(node, indent, isLane);

        if (isFinal && !isSubMachine && children.length === 0) {
            const finalBlocks = [metadataXml, onentryBlock, onexitBlock].filter(Boolean);
            if (finalBlocks.length > 0) {
                return `${indent}<final id="${skillId}">\n${finalBlocks.join("\n\n")}\n${indent}</final>`;
            }
            return `${indent}<final id="${skillId}"/>`;
        }

        const tagName = isParallel ? "parallel" : "state";
        const srcAttr = isSubMachine ? ` src="${node.data.src}"` : "";

        let initialAttr = "";
        if (isCompound || children.length > 0) {
            const initialChild = children.find((c) => c.data?.isInitial);
            if (initialChild) {
                initialAttr = ` initial="${initialChild.data.fullSkillName || initialChild.data.label}"`;
            } else if (node.data?.initialSubState) {
                initialAttr = ` initial="${node.data.initialSubState}"`;
            }
        }

        // A) Editor metadata / position

        // B) Datamodel
        const localParams = (node.data.params || []).filter(
            (p) => (p.expr && p.expr.trim() !== "") || (p.default && p.default.trim() !== "")
        );
        const paramsLines = localParams.map((p) => {
            const expr = serializeEditorValueForScxml(
                p.expr || p.default,
                { preserveReferenceMarker: true }
            );
            return `${indent}        <data id="${escapeXmlAttribute(p.key)}" expr="${escapeXmlAttribute(expr)}"/>`;
        });
        const datamodelBlock = paramsLines.length > 0 && !isSubMachine
            ? `${indent}    <datamodel>\n${paramsLines.join("\n")}\n${indent}    </datamodel>`
            : "";

        // C) Transitions:
        // Für Container (Parallel & Compound) ziehen wir austretende Transitions hoch
        const activeContainerId = isContainer ? node.id : currentContainerId;
        let transitionsXml = "";

        if (node.data?.isBehaviorExit && !isLane) {
            const configuredTransitions =
                Array.isArray(node.data?.behaviorExitTransitions) &&
                node.data.behaviorExitTransitions.length > 0
                    ? node.data.behaviorExitTransitions
                    : [
                        {
                            triggerEvent: "Nop.fatal",
                            sendEvents:
                                node.data?.behaviorExitEvents || [],
                        },
                    ];

            const configuredSend = configuredTransitions
                .map((transition) => {
                    const sendEvent = Array.isArray(transition.sendEvents)
                        ? transition.sendEvents.find(Boolean)
                        : null;
                    return sendEvent
                        ? {
                            triggerEvent:
                                transition.triggerEvent || "Nop.fatal",
                            sendEvent,
                        }
                        : null;
                })
                .find(Boolean);

            if (configuredSend) {
                transitionsXml = `${indent}    <transition event="${escapeXmlAttribute(configuredSend.triggerEvent)}">\n${indent}        <send event="${escapeXmlAttribute(configuredSend.sendEvent)}"/>\n${indent}    </transition>`;
            }
        } else if (isContainer) {
            const leavingTransitions = [];

            // 1. Eigene Parent-Transitions erfassen (z. B. Fallback 'Succeeder.*')
            const directParentTransitions = buildTransitionsXml(node, indent + "    ", null);
            if (directParentTransitions) {
                leavingTransitions.push(directParentTransitions);
            }

            // 2. Transitions aller Kindknoten erfassen, die nach DRAUSSEN führen
            nodes.forEach((n) => {
                if (isDescendantOf(n.id, node.id)) {
                    const outgoing = edges.filter(
                        (e) =>
                            e.source === n.id &&
                            !e.id.startsWith("edge-internal-") &&
                            !isDescendantOf(e.target, node.id)
                    );

                    outgoing.forEach((e) => {
                        const targetNode = nodes.find(
                            (tn) => tn.id === e.target
                        );

                        const targetId = targetNode
                            ? targetNode.data.fullSkillName ||
                              targetNode.data.label
                            : e.target;

                        /*
                         * Bei einer Parallel-Transition ist e.source
                         * möglicherweise die Lane.
                         *
                         * Die tatsächliche Source steckt dann in
                         * parallelOriginalSource.
                         */
                        const actualSourceId =
                            e.data?.parallelOriginalSource ||
                            e.source;

                        const actualSourceNode = nodes.find(
                            (candidate) =>
                                candidate.id === actualSourceId
                        );

                        const rawHandle =
                            e.sourceHandle ||
                            e.label ||
                            "success";

                        /*
                         * Wichtig:
                         * Den tatsächlichen Skillnamen verwenden,
                         * NICHT Lane_1.
                         */
                        const sourceSkillName =
                            actualSourceNode?.data?.fullSkillName ||
                            actualSourceNode?.data?.label ||
                            "";

                        const fullEvent =
                            getScxmlTransitionEvent(
                                rawHandle,
                                sourceSkillName
                            );

                        const condAttr =
                            e.data?.cond
                                ? ` cond="${escapeXmlAttribute(
                                      e.data.cond
                                  )}"`
                                : "";

                        const assignments =
                            Array.isArray(
                                e.data?.assignments
                            )
                                ? e.data.assignments
                                : e.data?.assign?.location
                                  ? [e.data.assign]
                                  : [];

                        if (assignments.length > 0) {
                            const assignmentLines =
                                assignments
                                    .filter(
                                        (assignment) =>
                                            assignment?.location &&
                                            assignment?.expr !==
                                                undefined
                                    )
                                    .map((assignment) => {
                                        const location =
                                            String(
                                                assignment.location
                                            )
                                                .trim()
                                                .replace(/^@/, "");

                                        const expr =
                                            serializeEditorValueForScxml(
                                                assignment.expr
                                            );

                                        return (
                                            `${indent}        ` +
                                            `<assign location="${escapeXmlAttribute(
                                                location
                                            )}" ` +
                                            `expr="${escapeXmlAttribute(
                                                expr
                                            )}"/>`
                                        );
                                    });

                            if (assignmentLines.length > 0) {
                                leavingTransitions.push(
                                    `${indent}    <transition event="${escapeXmlAttribute(
                                        fullEvent
                                    )}" target="${escapeXmlAttribute(
                                        targetId
                                    )}"${condAttr}>\n` +
                                    `${assignmentLines.join(
                                        "\n"
                                    )}\n` +
                                    `${indent}    </transition>`
                                );
                            } else {
                                leavingTransitions.push(
                                    `${indent}    <transition event="${escapeXmlAttribute(
                                        fullEvent
                                    )}" target="${escapeXmlAttribute(
                                        targetId
                                    )}"${condAttr}/>`
                                );
                            }
                        } else {
                            leavingTransitions.push(
                                `${indent}    <transition event="${escapeXmlAttribute(
                                    fullEvent
                                )}" target="${escapeXmlAttribute(
                                    targetId
                                )}"${condAttr}/>`
                            );
                        }
                    });
                }
            });

            // Doppelte Einträge vermeiden
            transitionsXml = Array.from(new Set(leavingTransitions)).join("\n");
        } else if (!isLane) {
            transitionsXml = buildTransitionsXml(node, indent + "    ", activeContainerId);
        }

        // D) Sub-States
        const childrenXml = children
            .map((child) => renderNode(child, depth + 1, activeContainerId))
            .join("\n\n");

        const innerBlocks = [
            metadataXml,
            datamodelBlock,
            onentryBlock,
            onexitBlock,
            transitionsXml,
            childrenXml,
        ].filter(Boolean);

        if (innerBlocks.length === 0) {
            return `${indent}<${tagName} id="${skillId}"${srcAttr}${initialAttr}/>`;
        }

        return `${indent}<${tagName} id="${skillId}"${srcAttr}${initialAttr}>\n${innerBlocks.join("\n\n")}\n${indent}</${tagName}>`;
    };

    const statesXml = topLevelNodes.map((node) => renderNode(node, 1)).join("\n\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:editor="http://bonsai.cit-ec.uni-bielefeld.de/editor"
       version="1.0"
       initial="${initialId}">

    <datamodel>
${globalDataXml}
    </datamodel>

${statesXml}

</scxml>\n`;
};

/**
 * Tauri desktop save: uses file path directly (no dialog) or shows save-as dialog.
 */
export const saveScxmlFileTauri = async (xmlString, filePath = null, defaultName = "workflow.xml") => {
    const { saveFile } = await import('../tauri-client.js');

    const result = await saveFile(xmlString, filePath, defaultName);

    return {
        success: result.success,
        fileName: result.file_name || defaultName,
        filePath: result.path || null,
    };
};

/**
 * Browser-mode save (File System Access API or download fallback).
 */
export const saveScxmlFile = async (xmlString, fileHandle = null, defaultName = "workflow.xml") => {
    if (fileHandle && fileHandle.createWritable) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(xmlString);
            await writable.close();
            return { success: true, handle: fileHandle, fileName: fileHandle.name };
        } catch (err) {
            console.warn("Konnte FileHandle nicht direkt beschreiben, zeige Speicherdialog:", err);
        }
    }

    if ("showSaveFilePicker" in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultName.endsWith(".xml") || defaultName.endsWith(".scxml") ? defaultName : `${defaultName}.xml`,
                types: [
                    {
                        description: "XML Workflow File",
                        accept: { "application/xml": [".xml", ".scxml"] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(xmlString);
            await writable.close();
            return { success: true, handle, fileName: handle.name };
        } catch (err) {
            if (err.name === "AbortError") return { aborted: true };
            console.error("SaveFilePicker Fehler:", err);
        }
    }

    // 3. Fallback: Normaler Browser-Download
    const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const downloadName = defaultName.endsWith(".xml") || defaultName.endsWith(".scxml") ? defaultName : `${defaultName}.xml`;
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, fileName: downloadName };
};

/**
 * Tauri desktop open: returns file path.
 */
export const openScxmlFileTauri = async () => {
    const { openFile } = await import('../tauri-client.js');
    return await openFile();
};

/**
 * Read file content by path (for Tauri).
 */
export const readScxmlFileContent = async (filePath) => {
    const { readFile } = await import('../tauri-client.js');
    return await readFile(filePath);
};
