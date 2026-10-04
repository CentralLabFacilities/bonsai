import { inspectWorkflowSource } from "../tauri-client.js";
import { parseScxmlFile } from "./scxmlImport";

export const getWorkflowFileKey = (path) => String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * Resolve/read one workflow and inspect its semantic interface.
 *
 * Resolution, file IO, SCXML parsing and metadata extraction are Rust-owned.
 * The result is cached by canonical path + mtime in the backend.
 */
export async function inspectWorkflowForEditorSource({
    src,
    directories = [],
    currentFilePath = null,
}) {
    if (!src) {
        throw new Error("Workflow source path is empty.");
    }

    const inspected = await inspectWorkflowSource(
        src,
        directories,
        currentFilePath
    );
    return {
        content: inspected.content || "",
        path: inspected.path || null,
        fileName:
            inspected.fileName ||
            String(src).split(/[\\/]/).pop() ||
            "",
        rootKey: inspected.rootKey || null,
        behaviorExitEvents: inspected.behaviorExitEvents || [],
        inheritedSlotDeclarations: inspected.inheritedSlots || [],
        localDataModel: inspected.localDataModel || [],
        workflow: inspected.workflow || null,
    };
}

export async function projectWorkflowInspectionForEditor(
    inspection,
    { fetchSkillData, getNodeId }
) {
    return await parseScxmlFile(
        inspection?.content || "",
        fetchSkillData,
        getNodeId,
        inspection?.workflow || null
    );
}

/** Resolve/inspect and immediately project a workflow into the legacy editor graph. */
export async function loadWorkflowForEditor({
    src,
    directories = [],
    currentFilePath = null,
    fetchSkillData,
    getNodeId,
}) {
    const inspection = await inspectWorkflowForEditorSource({
        src,
        directories,
        currentFilePath,
    });
    const parsed = await projectWorkflowInspectionForEditor(inspection, {
        fetchSkillData,
        getNodeId,
    });

    return {
        ...inspection,
        parsed,
    };
}
