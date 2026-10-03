import { invoke } from '@tauri-apps/api/core';
import { installApiProxy } from './utils/apiProxy.js';

/**
 * Polyfill fetch for /api/* paths when running in Tauri desktop mode.
 * Routes API calls through Rust IPC.
 */
export function initApiProxy() {
  if (isTauri()) installApiProxy(window, invoke);
}

/**
 * Open a file picker dialog and return the selected file path.
 */
export async function openFile(title = 'Open Workflow') {
  try {
    const result = await invoke('open_file', { title });
    return result || null;
  } catch (err) {
    console.error('Failed to open file:', err);
    return null;
  }
}

/**
 * Save content to a file. If path is provided, saves directly without dialog.
 * Otherwise shows a save-as dialog.
 */
export async function saveFile(content, path = null, title = 'Save Workflow') {
  try {
    const result = await invoke('save_file', { content, path, title });
    return result;
  } catch (err) {
    console.error('Failed to save file:', err);
    return { success: false, path: '', file_name: '' };
  }
}

/**
 * Read a file's contents.
 */
export async function readFile(path) {
  try {
    const content = await invoke('read_file', { path });
    return content;
  } catch (err) {
    console.error('Failed to read file:', err);
    return null;
  }
}



/**
 * Pick a local directory and return its path.
 */
export async function selectDirectory(title = 'Select Directory') {
  try {
    const result = await invoke('pick_directory', { title });
    return result || null;
  } catch (err) {
    console.error('Failed to select directory:', err);
    return null;
  }
}

/**
 * Recursively list nested directories and XML/SCXML files for one
 * Behavior Library root.
 */
export async function listBehaviorDirectory(key, path) {
  return await invoke('list_behavior_directory', {
    key,
    path,
  });
}

/**
 * Resolve, read and inspect one workflow in Rust.
 *
 * This keeps the symbolic ${KEY}/... source all the way to Rust. The backend
 * resolves it, caches the parsed WorkflowDto by
 * canonical path + modification time and returns the semantic interface
 * metadata together with the file contents.
 */
export async function inspectWorkflowSource(
    src,
    directories = [],
    currentFilePath = null,
) {
  if (!isTauri()) {
    throw new Error('Rust workflow inspection is only available in the Tauri app.');
  }

  return await invoke('inspect_workflow_source', {
    src: String(src || ''),
    directories: directories || [],
    currentFilePath,
  });
}

/**
 * Check if running inside Tauri (desktop app).
 */
export function isTauri() {
  return (
    typeof window !== 'undefined' &&
    (window.__TAURI_INTERNALS__ !== undefined || window.__TAURI__ !== undefined)
  );
}

/**
 * Parse SCXML into the serializable Rust workflow DTO and install the parsed
 * semantic workflow as the active revisioned Rust document.
 *
 * In the desktop app this is now the authoritative SCXML parser. React Flow
 * still receives its historical view-model shape through a compatibility
 * adapter, keeping the migration isolated from canvas behavior.
 */
export async function parseScxmlWorkflow(xml) {
  if (!isTauri()) {
    throw new Error('Rust SCXML parsing is only available in the Tauri app.');
  }

  return await invoke('parse_scxml_workflow', {
    xml: String(xml || ''),
  });
}

/**
 * Serialize the current editor graph through the Rust semantic export layer.
 * The payload is a compact serializable snapshot without React callbacks or
 * rendering-only objects.
 */
export async function serializeEditorWorkflow(request) {
  if (!isTauri()) {
    throw new Error('Rust editor SCXML serialization is only available in the Tauri app.');
  }

  return await invoke('serialize_editor_workflow', {
    request,
  });
}

/**
 * Validate the current editor state in Rust.
 *
 * The request is deliberately a small semantic snapshot rather than React
 * Flow nodes. This keeps callbacks, geometry and transient UI state out of IPC.
 */
/**
 * Replace the Rust-owned document from the current editor graph snapshot.
 * Unlike serialization this does not generate XML; it only normalizes the
 * editor projection into the semantic Rust Workflow model and returns the new
 * revision.
 */
export async function replaceActiveEditorWorkflowDocument(
  request,
  expectedRevision = null
) {
  if (!isTauri()) {
    throw new Error('Rust workflow document state is only available in the Tauri app.');
  }

  return await invoke('replace_active_editor_workflow_document', {
    request,
    expectedRevision,
  });
}

/**
 * Apply one semantic mutation to the Rust-owned workflow.
 * `expectedRevision` enables optimistic concurrency when several UI actions
 * are in flight. The response is a small patch summary, not the whole workflow.
 */
export async function applyWorkflowCommand(command, expectedRevision = null) {
  if (!isTauri()) {
    throw new Error('Rust workflow commands are only available in the Tauri app.');
  }

  return await invoke('apply_workflow_command', {
    command,
    expectedRevision,
  });
}

export async function validateEditorWorkflow(request) {
  if (!isTauri()) {
    throw new Error('Rust editor validation is only available in the Tauri app.');
  }

  return await invoke('validate_editor_workflow', {
    request,
  });
}

export async function validateActiveWorkflow(request) {
  if (!isTauri()) {
    throw new Error('Rust active workflow validation is only available in the Tauri app.');
  }

  return await invoke('validate_active_workflow', {
    request,
  });
}

/**
 * Resolve the inherited-slot source chain across open parent state machines.
 * The request contains only semantic slot/tab data; React Flow geometry and
 * callbacks never cross the Tauri boundary.
 */
export async function resolveEditorSlotAncestry(request) {
  if (!isTauri()) {
    throw new Error('Rust slot ancestry is only available in the Tauri app.');
  }

  return await invoke('resolve_editor_slot_ancestry', {
    request,
  });
}

export async function resolveActiveEditorSlotAncestry(request) {
  if (!isTauri()) {
    throw new Error('Rust active slot ancestry is only available in the Tauri app.');
  }

  return await invoke('resolve_active_editor_slot_ancestry', {
    request,
  });
}
/**
 * Analyze semantic transitions that leave the currently selected container.
 * Visual boundary/helper edge routing stays in React; Rust only receives the
 * compact semantic node/edge snapshot.
 */
export async function analyzeEditorTransitions(request) {
  if (!isTauri()) {
    throw new Error('Rust transition analysis is only available in the Tauri app.');
  }

  return await invoke('analyze_editor_transitions', {
    request,
  });
}


/**
 * Parse a SkillStateMachine runtime log in Rust.
 *
 * The returned object is the canonical runtime-log DTO consumed by the
 * React replay controller.
 */
export async function parseRuntimeLogText(text) {
  if (!isTauri()) {
    throw new Error('Rust runtime-log parsing is only available in the Tauri app.');
  }

  return await invoke('parse_runtime_log_text', {
    text: String(text || ''),
  });
}

/**
 * Resolve all expensive runtime replay structures in Rust.
 * The request is a compact semantic snapshot of the open workflow contexts;
 * React Flow callbacks and rendering-only state never cross the Tauri boundary.
 */
export async function prepareRuntimeReplayCacheRust(request) {
  if (!isTauri()) {
    throw new Error('Rust runtime replay preparation is only available in the Tauri app.');
  }

  return await invoke('prepare_runtime_replay_cache', {
    request,
  });
}
