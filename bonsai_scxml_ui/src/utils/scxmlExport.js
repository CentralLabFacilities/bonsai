/**
 * Generiert den SCXML-Code-String inklusive <metadata> Positionen, Slots,
 * Sub-State-Machines und Condition/Assign-Transitions.
 */
export const generateXmlString = (nodes, globalDataModel = []) => {
    if (!nodes || nodes.length === 0) return "";

    const initialNode = nodes.find((n) => n.data?.isInitial) || nodes[0];
    const initialId = initialNode ? initialNode.data.fullSkillName || initialNode.data.label : "";

    // 1. Slots aus den Knoten sammeln
    const slotEntries = [];
    nodes.forEach((node) => {
        const skillName = node.data.fullSkillName || node.data.label;
        const allSlots = [...(node.data.inSlots || []), ...(node.data.outSlots || [])];

        allSlots.forEach((slot) => {
            if (slot.path && slot.path.trim() !== "") {
                const formattedPath = slot.path.startsWith("/") ? slot.path : `/${slot.path}`;
                slotEntries.push(
                    `            <slot key="${slot.key}" state="${skillName}" xpath="${formattedPath}"/>`
                );
            }
        });
    });

    const slotsXml = slotEntries.length > 0
        ? `        <data id="#_SLOTS">\n            <slots>\n${slotEntries.join("\n")}\n            </slots>\n        </data>`
        : "";

    // 2. Globales Datamodel zusammenbauen
    const globalDataLines = (globalDataModel || []).map((d) => `        <data id="${d.id}" expr="${d.expr}"/>`);
    if (slotsXml) {
        globalDataLines.splice(1, 0, slotsXml);
    }
    const globalDataXml = globalDataLines.join("\n");

    // 3. States / Sub-Machines aufbauen
    const statesXml = nodes
        .map((node) => {
            const skillId = node.data.fullSkillName || node.data.label;
            const isSubMachine = Boolean(node.data?.src);
            const isFinal = node.data?.isFinal || skillId.toLowerCase() === "end" || skillId.toLowerCase() === "fatal";

            if (isFinal && !isSubMachine) {
                return `    <final id="${skillId}"/>`;
            }

            const srcAttr = isSubMachine ? ` src="${node.data.src}"` : "";

            // A) Position als Metadata Tag
            const posX = Math.round(node.position?.x || 0);
            const posY = Math.round(node.position?.y || 0);
            const metadataXml = `        <metadata>\n            <editor:position x="${posX}" y="${posY}"/>\n        </metadata>`;

            // B) Lokale Parameter
            const localParams = (node.data.params || []).filter(
                (p) => (p.expr && p.expr.trim() !== "") || (p.default && p.default.trim() !== "")
            );
            const paramsXml = localParams
                .map((p) => `            <data id="${p.key}" expr="${p.expr || p.default}"/>`)
                .join("\n");

            const datamodelBlock = paramsXml && !isSubMachine
                ? `        <datamodel>\n${paramsXml}\n        </datamodel>`
                : "";

            // C) OnEntry Assigns
            const assignments = (node.data.params || []).filter((p) => p.location && p.expr);
            const onentryBlock = assignments.length > 0
                ? `        <onentry>\n${assignments.map((a) => `            <assign location="${a.location}" expr="${a.expr}"/>`).join("\n")}\n        </onentry>`
                : "";

            // D) Transitions
            const transitionsXml = (node.data.events || [])
                .filter((ev) => ev.target)
                .map((ev) => {
                    const targetNode = nodes.find((n) => n.id === ev.target);
                    const targetId = targetNode ? targetNode.data.fullSkillName || targetNode.data.label : ev.target;

                    const prefix = isSubMachine ? node.data.label : node.data.label.split(".")[0];
                    const eventName = ev.id.includes(".") ? ev.id : `${prefix}.${ev.id}`;
                    const condAttr = ev.cond && ev.cond.trim() !== "" ? ` cond="${ev.cond}"` : "";

                    if (ev.assignLocation && ev.assignExpr) {
                        return `        <transition event="${eventName}" target="${targetId}"${condAttr}>\n            <assign location="${ev.assignLocation}" expr="${ev.assignExpr}"/>\n        </transition>`;
                    }
                    return `        <transition event="${eventName}" target="${targetId}"${condAttr}/>`;
                })
                .join("\n");

            const innerParts = [metadataXml, datamodelBlock, onentryBlock, transitionsXml]
                .filter(Boolean)
                .join("\n");

            if (!innerParts) {
                return `    <state id="${skillId}"${srcAttr}/>`;
            }

            return `    <state id="${skillId}"${srcAttr}>\n${innerParts}\n    </state>`;
        })
        .join("\n\n");

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
    // 1. Wenn bereits ein geöffnetes FileHandle existiert -> Direkt überschreiben
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

    // 2. Neuer Speicher-Dialog via File System Access API
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
