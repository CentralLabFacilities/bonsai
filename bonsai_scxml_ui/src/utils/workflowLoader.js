import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "../config/prefixMapping";
import { inspectWorkflowSource, isTauri } from "../tauri-client.js";
import {
    extractBehaviorExitEventsFromScxml,
    parseScxmlFile,
} from "./scxmlImport";
import { extractInheritedSlotsFromScxml } from "./editorGraph";

/**
 * Resolve/read one workflow and inspect its semantic interface.
 *
 * Desktop mode performs resolution, file IO, SCXML parsing and metadata
 * extraction in Rust. The Rust result is cached by canonical path + mtime.
 * Browser mode keeps the historical fetch/DOM fallback.
 */
export async function inspectWorkflowForEditorSource({
    src,
    directories = [],
    currentFilePath = null,
}) {
    if (!src) {
        throw new Error("Workflow source path is empty.");
    }

    if (isTauri()) {
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

    const resolvedUrl = resolveSrcPath(src, DEFAULT_PREFIX_CONFIG);
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
        throw new Error(
            `Server returned status ${response.status} (${response.statusText})`
        );
    }

    const content = await response.text();
    return {
        content,
        path: null,
        fileName: String(src).split(/[\\/]/).pop() || "",
        rootKey: null,
        behaviorExitEvents: extractBehaviorExitEventsFromScxml(content),
        inheritedSlotDeclarations: extractInheritedSlotsFromScxml(content),
        localDataModel: [],
        workflow: null,
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
