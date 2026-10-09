import { useLayoutEffect, useMemo, useRef } from "react";
import { getExportFullSkillName, getSharedScxmlStateKey } from "../../utils/editorScxml.js";
import { isEditorCloneNode } from "../../utils/editorClones.js";
import { useDerivedGraphSnapshot } from "../graph/useEditorGraphMaintenance.js";

const EMPTY = [];
const MAX_CONTEXTS = 256;
const text = (value) => typeof value === "string" ? value.trim() : "";

// StateID canonicalizes the skill, not the invocation/instance suffixes.
const runnerId = (value) => {
    const id = text(value);
    const hash = id.indexOf("#");
    const skill = hash < 0 ? id : id.slice(0, hash);
    return skill.slice(skill.lastIndexOf(".") + 1) + (hash < 0 ? "" : id.slice(hash));
};

const fingerprint = (tab) => tab?.fingerprint ?? (tab?.isModified ? null : tab?.savedFingerprint);

const contextValid = (context, validTabs) => {
    for (let current = context; current; current = current.parent) {
        if (!validTabs.has(current.document.tab.id)) return false;
    }
    return true;
};

function compileDocument(tab) {
    const nodes = tab.nodes || EMPTY;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const groups = new Map();
    const groupByNodeId = new Map();
    nodes.forEach((node) => {
        if (isEditorCloneNode(node) || !["custom", "submachine"].includes(node.type)) return;
        const identity = text(getExportFullSkillName(node) || node.data?.label);
        if (!identity) return; // Editor UUIDs are never runner aliases.
        const key = getSharedScxmlStateKey(node) || node.id;
        let group = groups.get(key);
        if (!group) {
            group = { id: node.id, identity, type: node.type, src: text(node.data?.src), visualIds: [] };
            groups.set(key, group);
        } else if (!node.parentId && byId.get(group.id)?.parentId) {
            group.id = node.id;
        }
        group.visualIds.push(node.id);
        groupByNodeId.set(node.id, group);
    });
    nodes.forEach((node) => {
        if (!isEditorCloneNode(node)) return;
        const group = groupByNodeId.get(node.data.cloneOfNodeId);
        if (group) group.visualIds.push(node.id);
    });
    return { tab, byId, groups: [...groups.values()] };
}

function sourceMatchesFile(source, parent, child, includeMapping) {
    const normalize = (value) => {
        const path = text(value).replace(/\\/g, "/");
        const prefix = path.match(/^(?:[A-Za-z]:)?\//)?.[0];
        if (!prefix) return "";
        const parts = [];
        path.slice(prefix.length).split("/").forEach((part) => {
            if (part === "..") parts.pop();
            else if (part && part !== ".") parts.push(part);
        });
        return prefix + parts.join("/");
    };
    const symbolic = source.match(/^\$\{([^}]+)\}[\\/](.*)$/);
    let path = source;
    if (symbolic) {
        const base = text(includeMapping?.[symbolic[1]]);
        if (!base) return false;
        path = `${base}/${symbolic[2]}`;
    } else if (!normalize(path)) {
        const parentPath = text(parent.filePath).replace(/\\/g, "/");
        if (!normalize(parentPath)) return false;
        path = `${parentPath.slice(0, parentPath.lastIndexOf("/"))}/${path}`;
    }
    const expected = normalize(path);
    // Unknown or differently canonicalized paths stay at the wrapper.
    return Boolean(expected && expected === normalize(child.filePath));
}

function compileContexts(workflow, tabsSnapshot) {
    if (!workflow?.id) return null;
    const documents = new Map([[workflow.id, compileDocument(workflow)]]);
    const duplicates = new Set();
    (tabsSnapshot || EMPTY).forEach((tab) => {
        if (!tab?.id || tab.id === workflow.id) return;
        // Only the root is staged; unsaved child tabs do not describe the files the engine loads.
        if (tab.isModified || tab.fingerprint !== tab.savedFingerprint) return;
        if (documents.has(tab.id)) duplicates.add(tab.id);
        else documents.set(tab.id, compileDocument(tab));
    });
    duplicates.forEach((id) => documents.delete(id));
    const contexts = [{ document: documents.get(workflow.id), suffix: "", parent: null, wrapper: null }];
    const states = new Map();
    const wrappers = [];
    // An invocation is a context, not a tab: the same child file can be invoked
    // more than once. Exact source + parent links prove association, not titles.
    for (let index = 0; index < contexts.length; index += 1) {
        const context = contexts[index];
        context.document.groups.forEach((group) => {
            if (group.type === "custom" && !group.src) {
                const id = runnerId(group.identity + context.suffix);
                if (!states.has(id)) states.set(id, []);
                states.get(id).push({ context, group });
            } else if (group.type === "submachine" && group.src) {
                const suffix = `#${group.identity}${context.suffix}`;
                wrappers.push({ context, group, suffix });
                const children = [...documents.values()].filter(({ tab }) =>
                    tab.parentTabId === context.document.tab.id && text(tab.sourcePath) === group.src
                        && sourceMatchesFile(group.src, context.document.tab, tab, workflow.includeMapping));
                const child = children.length === 1 ? children[0] : null;
                let ancestor = context;
                while (ancestor && ancestor.document !== child) ancestor = ancestor.parent;
                if (child && !ancestor && contexts.length < MAX_CONTEXTS) {
                    contexts.push({ document: child, suffix, parent: context, wrapper: group });
                }
            }
        });
    }
    return { workflow, contexts, states, wrappers };
}

function projectEntry(entry, tabId, validTabs, visibleById) {
    let { context, group, contextual = false } = entry;
    while (context && (context.document.tab.id !== tabId || !contextValid(context, validTabs))) {
        group = context.wrapper;
        context = context.parent;
        contextual = true;
    }
    if (!context || !group) return { ids: EMPTY, cameraIds: EMPTY, contextual: true };
    const ids = group.visualIds.filter((id) => visibleById.has(id));
    if (ids.length) return { ids, cameraIds: ids.includes(group.id) ? [group.id] : ids, contextual };
    let node = context.document.byId.get(group.id);
    const visited = new Set();
    while (node?.parentId && !visited.has(node.parentId)) {
        visited.add(node.parentId);
        node = context.document.byId.get(node.parentId);
        const visible = visibleById.get(node?.id);
        if (visible && ["compound", "parallel"].includes(visible.type) && visible.data?.isCollapsed) {
            return { ids: [visible.id], cameraIds: [visible.id], contextual: true };
        }
    }
    return { ids: EMPTY, cameraIds: EMPTY, contextual: true };
}

function projectLive(previous, model, stateIds, validTabs, activeTabId, visibleNodes, enabled) {
    const unresolvedStates = [];
    const entries = [];
    stateIds.forEach((id) => {
        const matches = model?.states.get(id) || EMPTY;
        if (matches.length === 1) entries.push(matches[0]);
        else {
            unresolvedStates.push(id);
            const candidates = (model?.wrappers || EMPTY).filter((wrapper) =>
                id.length > wrapper.suffix.length && id.endsWith(wrapper.suffix));
            const longest = Math.max(0, ...candidates.map((wrapper) => wrapper.suffix.length));
            const closest = candidates.filter((wrapper) => wrapper.suffix.length === longest);
            if (closest.length === 1) entries.push({ ...closest[0], contextual: true });
        }
    });
    const visibleById = new Map(visibleNodes.filter((node) => !node.hidden).map((node) => [node.id, node]));
    const classes = new Map();
    const camera = new Set();
    if (enabled) entries.forEach((entry) => {
        const projected = projectEntry(entry, activeTabId, validTabs, visibleById);
        projected.ids.forEach((id) => {
            if (!classes.has(id) || !projected.contextual) {
                classes.set(id, projected.contextual ? "runtime-live-context-node" : "runtime-log-target-node");
            }
        });
        projected.cameraIds.forEach((id) => camera.add(id));
    });
    const painted = new Map();
    const nodes = classes.size ? visibleNodes.map((node) => {
        const extra = classes.get(node.id);
        if (!extra) return node;
        const className = [...new Set([...text(node.className).split(/\s+/).filter(Boolean), extra])].join(" ");
        if (className === node.className) return node;
        const cached = previous?.painted.get(node.id);
        const decorated = cached?.source === node && cached.node.className === className
            ? cached.node : { ...node, className };
        painted.set(node.id, { source: node, node: decorated });
        return decorated;
    }) : visibleNodes;
    // A parallel set spanning invocation contexts stays at the root. Only one
    // proven invocation may pull the camera into an already-open child tab.
    const uniqueContext = entries.length === stateIds.length && entries.length &&
        !entries.some((entry) => entry.contextual || entry.context !== entries[0].context);
    let target = uniqueContext ? entries[0].context : null;
    while (target && !contextValid(target, validTabs)) target = target.parent;
    return { nodes, painted, cameraIds: [...camera].sort(), unresolvedStates,
        targetTabId: target?.document.tab.id || model?.workflow.id };
}

/** Read-only, loaded-version-bound active-runner paint and optional camera follow.
 * Keep workflow/tabsSnapshot immutable and stable for one run; pass display nodes,
 * never this projection back into the editor's semantic document.
 */
export function useLiveExecution({
    liveExecution,
    onOpenSubMachine,
    onExpandContainer,
    tabs = EMPTY,
    activeTabId,
    activeDocumentGeneration,
    activeFingerprint,
    visibleNodes = EMPTY,
    visibleEdges = EMPTY,
    fitView,
    switchTab,
    suspendFollow = false,
    getActiveDocumentIdentity,
}) {
    const workflow = liveExecution?.workflow;
    const tabsSnapshot = liveExecution?.tabsSnapshot;
    // Newly opened child tabs may not have been open when the root workflow was
    // loaded. Include only pristine, source-verified tabs; compileContexts still
    // validates the invocation chain and the saved file path.
    const model = useMemo(() => {
        if (!workflow) return null;
        const atLoad = new Set((tabsSnapshot || EMPTY).map((tab) => tab.id));
        const available = [...(tabsSnapshot || EMPTY), ...tabs.filter((tab) =>
            !atLoad.has(tab.id) && !tab.isModified && tab.fingerprint === tab.savedFingerprint)];
        return compileContexts(workflow, available);
    }, [workflow, tabsSnapshot, tabs]);
    const statesKey = JSON.stringify([...new Set((liveExecution?.snapshot?.currentStates || EMPTY)
        .map(runnerId).filter(Boolean))].sort());
    const validTabs = useMemo(() => {
        const result = new Set();
        const currentTabs = new Map(tabs.map((tab) => [tab.id, tab]));
        model?.contexts.forEach(({ document: { tab } }) => {
            const current = currentTabs.get(tab.id);
            const generation = tab.id === activeTabId ? activeDocumentGeneration : current?.documentGeneration;
            const currentFingerprint = tab.id === activeTabId ? activeFingerprint : fingerprint(current);
            if (current && current.filePath === tab.filePath && current.parentTabId === tab.parentTabId
                && text(current.sourcePath) === text(tab.sourcePath)
                && tab.documentGeneration != null && generation === tab.documentGeneration &&
                typeof tab.fingerprint === "string" && currentFingerprint === tab.fingerprint) result.add(tab.id);
        });
        return result;
    }, [model, tabs, activeTabId, activeDocumentGeneration, activeFingerprint]);
    const status = liveExecution?.snapshot?.status;
    const following = Boolean(liveExecution?.following && liveExecution?.action !== "stop");
    const rootValid = Boolean(model && validTabs.has(workflow.id));
    const liveActive = rootValid && Boolean(model?.contexts.some((context) =>
        context.document.tab.id === activeTabId && contextValid(context, validTabs))) &&
        following && ["RUNNING", "PAUSED"].includes(status);
    const projection = useDerivedGraphSnapshot(
        [model, statesKey, validTabs, activeTabId, visibleNodes, liveActive],
        (previous) => projectLive(previous, model, JSON.parse(statesKey), validTabs, activeTabId, visibleNodes, liveActive),
    );
    const wantsCamera = following && Boolean(liveExecution?.followCamera) && status === "RUNNING";
    const action = liveExecution?.action;
    const followRef = useRef({ model: null, statesKey: null, enabled: false, pending: null });
    const attemptedOpenRef = useRef({ workflow: null, keys: new Set() });

    useLayoutEffect(() => {
        if (attemptedOpenRef.current.workflow !== workflow) {
            attemptedOpenRef.current = { workflow, keys: new Set() };
        }
        if (!following || status !== "RUNNING" || suspendFollow || !rootValid || !model) return;
        const currentStates = JSON.parse(statesKey);

        // A user-selected "Highlight only" mode never switches tabs, even if
        // automatic child navigation is enabled.
        if (wantsCamera && liveExecution?.autoOpenSubMachines && onOpenSubMachine) {
            const wrappers = model.wrappers.filter((wrapper) =>
                wrapper.context.document.tab.id === activeTabId &&
                contextValid(wrapper.context, validTabs) &&
                !model.contexts.some((ctx) => ctx.parent === wrapper.context && ctx.wrapper === wrapper.group) &&
                currentStates.some((state) => state.length > wrapper.suffix.length && state.endsWith(wrapper.suffix)));
            // Require one unambiguous wrapper at the deepest matching suffix.
            const longest = Math.max(0, ...wrappers.map((wrapper) => wrapper.suffix.length));
            const matching = wrappers.filter((wrapper) => wrapper.suffix.length === longest);
            if (matching.length === 1) {
                const wrapper = matching[0];
                const key = `${activeTabId}:${wrapper.group.id}:${wrapper.suffix}`;
                if (!attemptedOpenRef.current.keys.has(key)) {
                    attemptedOpenRef.current.keys.add(key);
                    void onOpenSubMachine(wrapper.group.src, wrapper.group.identity, { runtimeNavigation: true });
                }
            }
        }

        // Reveal collapsed ancestors of the active states without changing the
        // editor document. The presentation graph restores the normal collapsed
        // appearance as soon as the live run ends.
        if (onExpandContainer && (liveExecution?.autoExpandCompounds || liveExecution?.autoExpandParallels)) {
            const toExpand = new Set();
            currentStates.forEach((state) => {
                const matches = model.states.get(state) || EMPTY;
                if (matches.length !== 1) return;
                const entry = matches[0];
                if (entry.context.document.tab.id !== activeTabId || !contextValid(entry.context, validTabs)) return;
                const byId = entry.context.document.byId;
                let node = byId.get(entry.group.id);
                const visited = new Set();
                while (node?.parentId && !visited.has(node.parentId)) {
                    visited.add(node.parentId);
                    node = byId.get(node.parentId);
                    if (node?.data?.isCollapsed &&
                        ((node.type === "compound" && liveExecution.autoExpandCompounds) ||
                         (node.type === "parallel" && liveExecution.autoExpandParallels))) {
                        toExpand.add(node.id);
                    }
                }
            });
            toExpand.forEach((id) => onExpandContainer(activeTabId, id));
        }
    }, [workflow, following, status, suspendFollow, rootValid, model, statesKey,
        wantsCamera, liveExecution?.autoOpenSubMachines, liveExecution?.autoExpandCompounds,
        liveExecution?.autoExpandParallels, activeTabId, validTabs, onOpenSubMachine, onExpandContainer]);

    useLayoutEffect(() => {
        const follow = followRef.current;
        const changed = follow.model !== model || follow.statesKey !== statesKey;
        const explicitlyEnabled = wantsCamera && (!follow.enabled ||
            (action !== follow.action && ["start", "resume"].includes(action)));
        follow.model = model;
        follow.statesKey = statesKey;
        follow.enabled = wantsCamera;
        follow.action = action;
        if (changed || explicitlyEnabled) {
            follow.pending = { tabId: activeTabId, generation: activeDocumentGeneration,
                fingerprint: activeFingerprint, expectedTabId: null };
        }
        const request = follow.pending;
        if (!wantsCamera || !liveActive || !request || !rootValid) {
            follow.pending = null;
            return undefined;
        }
        const arrived = request.expectedTabId === activeTabId;
        if (!arrived && (request.tabId !== activeTabId || request.generation !== activeDocumentGeneration ||
            request.fingerprint !== activeFingerprint)) {
            follow.pending = null; // Manual switch/edit must not be fought by a late frame.
            return undefined;
        }
        if (suspendFollow || typeof window === "undefined") return undefined;
        const identity = getActiveDocumentIdentity?.();
        let cancelled = false;
        const frames = new Set();
        const owned = () => !cancelled && follow.pending === request &&
            (!getActiveDocumentIdentity || getActiveDocumentIdentity() === identity);
        const schedule = (callback) => {
            const frame = window.requestAnimationFrame(() => {
                frames.delete(frame);
                if (owned()) callback();
            });
            frames.add(frame);
        };
        if (projection.targetTabId && projection.targetTabId !== activeTabId && switchTab) {
            schedule(() => {
                request.expectedTabId = projection.targetTabId;
                switchTab(projection.targetTabId);
            });
        } else if (projection.cameraIds.length && fitView) {
            const fit = () => {
                follow.pending = null;
                fitView({ nodes: projection.cameraIds.map((id) => ({ id })), padding: 0.55, duration: 320, maxZoom: 1.15 });
            };
            // Tab restoration owns two frames; fit after its viewport restore.
            schedule(() => arrived ? schedule(fit) : fit());
        }
        return () => {
            cancelled = true;
            frames.forEach((frame) => window.cancelAnimationFrame(frame));
        };
    }, [model, statesKey, wantsCamera, action, liveActive, rootValid, activeTabId,
        activeDocumentGeneration, activeFingerprint, suspendFollow, projection, fitView, switchTab, getActiveDocumentIdentity]);

    return { liveVisibleNodes: projection.nodes, liveVisibleEdges: visibleEdges,
        liveActive, unresolvedStates: projection.unresolvedStates };
}
