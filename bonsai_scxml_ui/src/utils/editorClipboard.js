const CLIPBOARD_TRANSIENT_KEYS = new Set([
    "routingNodes",
    "slotConnectionDrag",
    "outgoingTransitionHandles",
    "isDropTarget",
    "mode",
]);

export const cloneGraphValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(cloneGraphValue);
    }

    if (value && typeof value === "object") {
        const clone = {};
        Object.entries(value).forEach(([key, entry]) => {
            clone[key] = cloneGraphValue(entry);
        });
        return clone;
    }

    return value;
};

export const cloneClipboardValue = (value, ancestors = new WeakSet()) => {
    if (typeof value === "function") return undefined;

    if (Array.isArray(value)) {
        if (ancestors.has(value)) return undefined;
        ancestors.add(value);
        const clone = [];
        value.forEach((entry) => {
            const copiedEntry = cloneClipboardValue(entry, ancestors);
            if (copiedEntry !== undefined) clone.push(copiedEntry);
        });
        ancestors.delete(value);
        return clone;
    }

    if (value && typeof value === "object") {
        if (ancestors.has(value)) return undefined;
        ancestors.add(value);
        const clone = {};
        Object.entries(value).forEach(([key, entry]) => {
            if (CLIPBOARD_TRANSIENT_KEYS.has(key)) return;
            const copiedEntry = cloneClipboardValue(entry, ancestors);
            if (copiedEntry !== undefined) clone[key] = copiedEntry;
        });
        ancestors.delete(value);
        return clone;
    }

    return value;
};

let persistentGraphClipboard = null;

export const getPersistentGraphClipboard = () => persistentGraphClipboard;

export const setPersistentGraphClipboard = (clipboard) => {
    persistentGraphClipboard = clipboard;
};

export const sanitizePersistentGraphClipboard = () => {
    persistentGraphClipboard = persistentGraphClipboard
        ? cloneClipboardValue(persistentGraphClipboard)
        : null;
    return persistentGraphClipboard;
};

export const hasClipboardContent = (clipboard) =>
    Boolean(
        clipboard &&
            ((clipboard.nodes?.length || 0) > 0 ||
                (clipboard.slotNodes?.length || 0) > 0)
    );

export const isTypingTarget = (target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
        target.closest(
            'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
        )
    );
};
