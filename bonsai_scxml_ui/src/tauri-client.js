import { invoke } from '@tauri-apps/api/core';

const API_TARGET = 'http://localhost:8080';

/**
 * Polyfill fetch for /api/* paths when running in Tauri desktop mode.
 * Routes API calls through Rust IPC.
 */
export function initApiProxy() {
  if (!isTauri()) return;

  const originalFetch = window.fetch;

  window.fetch = async function (input, init) {
    let url = '';
    let method = 'GET';
    let body = null;


    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
      method = input.method || 'GET';
      if (input.body) {
        body = await input.text();
      }
    }

    console.info("Tauri fetch")

    // Only intercept /api/* paths
    if (!url.startsWith('/api/')) {
      return originalFetch.apply(this, [input, init]);
    }

    try {
      const result = await invoke('api_request', {
        method: method.toUpperCase(),
        path: url,
        body: body || null,
      });
      return new Response(result.body, {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error(`fetch proxy failed (${method} ${url}):`, err);
      throw err;
    }
  };
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
 * Resolve a symbolic Behavior Library source to the real local path.
 *
 * Example:
 *   src: ${ROBOCUP}/planning/SetupPlanning.xml
 *   ROBOCUP: /home/user/robocup_ws/robocup
 *
 * becomes:
 *   /home/user/robocup_ws/robocup/planning/SetupPlanning.xml
 *
 * The symbolic source itself is NOT changed in the workflow. This resolver
 * is only used when accessing the file on disk.
 */
export function resolveBehaviorSourcePath(src, directories = []) {
  const value = String(src || '').trim();

  const match = value.match(/^\$\{([^}]+)\}(?:[\\/](.*))?$/);

  if (!match) {
    return {
      path: value,
      key: null,
    };
  }

  const key = match[1].trim().toUpperCase();
  const relativePath = String(match[2] || '')
      .replace(/^[\\/]+/, '');

  const mapping = directories.find(
      (directory) =>
          String(directory?.key || '').trim().toUpperCase() === key,
  );

  if (!mapping) {
    throw new Error(
        `Behavior Library key ${key} is not configured.`,
    );
  }

  const root = String(mapping.path || '')
      .trim()
      .replace(/[\\/]+$/, '');

  if (!root) {
    throw new Error(
        `Behavior Library key ${key} does not have a directory path.`,
    );
  }

  return {
    path: relativePath ? `${root}/${relativePath}` : root,
    key,
  };
}

/**
 * Read a workflow directly from disk.
 *
 * ${KEY}/... is expanded to the configured Behavior Library path before
 * anything is sent to the Tauri filesystem command.
 */
export async function readWorkflowSource(
    src,
    directories = [],
    currentFilePath = null,
) {
  const resolved = resolveBehaviorSourcePath(src, directories);

  return await invoke('read_workflow_source', {
    // The Rust side receives the real local path, never the symbolic ${KEY}.
    src: resolved.path,
    directories: [],
    currentFilePath,
  });
}

/**
 * Check if running inside Tauri (desktop app).
 */
export function isTauri() {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}
