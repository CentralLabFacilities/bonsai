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

/**
 * Generiert den SCXML-Code-String inklusive <metadata> Positionen, Slots,
 * Sub-State-Machines und Condition/Assign-Transitions.
 */
export const generateXmlString = (nodes, edgesOrDataModel = [], maybeDataModel = []) => {
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
    nodes.forEach((node) => {
        const skillName = node.data.fullSkillName || node.data.label;
        const allSlots = [...(node.data.inSlots || []), ...(node.data.outSlots || [])];

        allSlots.forEach((slot) => {
            if (slot.path && slot.path.trim() !== "") {
                const formattedPath = slot.path.startsWith("/") ? slot.path : `/${slot.path}`;
                slotEntries.push(
                    `                <slot key="${slot.key}" state="${skillName}" xpath="${formattedPath}"/>`
                );
            }
        });
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
    const buildTransitionsXml = (node, indent) => {
        const connectedEdges = edges.filter((e) => e.source === node.id);
        const nodeEvents = (node.data?.events || []).filter((ev) => ev.target);

        const combinedTransitions = [];

        // Kanten aus der Canvas erfassen
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
                cond,
                assignments,
            });
        });

        // Event-Einträge aus data.events abgleichen
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

        // Basis-Name für den State-Präfix ermitteln (z.B. SayMultipleSlots aus dialog.SayMultipleSlots#1)
        const rawState = node.data?.label || node.data?.fullSkillName || "";
        const skillBaseName = rawState.split("#")[0].split(".").pop();

        return combinedTransitions
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
    const renderNode = (node, depth = 1) => {
        const indent = "    ".repeat(depth);
        const skillId = node.data.fullSkillName || node.data.label;
        const isParallel = node.type === "parallel";
        const isCompound = node.type === "compound";
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

        if (isFinal && !isSubMachine && children.length === 0) {
            const finalActionBlocks = [onentryBlock, onexitBlock].filter(Boolean);
            if (finalActionBlocks.length > 0) {
                return `${indent}<final id="${skillId}">\n${finalActionBlocks.join("\n\n")}\n${indent}</final>`;
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

        // A) Position
        const posX = Math.round(node.position?.x || 0);
        const posY = Math.round(node.position?.y || 0);
        const metadataXml = `${indent}    <metadata>\n${indent}        <editor:position x="${posX}" y="${posY}"/>\n${indent}    </metadata>`;

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

        // C) Transitions
        const transitionsXml = buildTransitionsXml(node, indent + "    ");

        // D) Sub-States
        const childrenXml = children.map((child) => renderNode(child, depth + 1)).join("\n\n");

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
