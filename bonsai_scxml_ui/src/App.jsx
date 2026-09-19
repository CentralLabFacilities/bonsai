import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FiTrash2, FiPlus, FiX } from "react-icons/fi";
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    MarkerType,
    ConnectionMode,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
    useUpdateNodeInternals,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SmartEdgeProvider } from "@tisoap/react-flow-smart-edge";

// Ausgelagerte Komponenten
import CustomNode from "./components/CustomNode";
import SlotNode from "./components/SlotNode";
import ParallelNode from "./components/ParallelNode";
import SubMachineNode from "./components/SubMachineNode";
import Header from "./components/Header";
import SkillLibrary from "./components/SkillLibrary";
import BehaviorLibrary from "./components/BehaviorLibrary";
import DetailsPanel from "./components/DetailsPanel";
import WorkflowPanel from "./components/WorkflowPanel";
import CodeView from "./components/CodeView";
import ConditionModal from "./components/ConditionModal";
import CompoundNode from "./components/CompoundNode";
import ParallelLaneNode from "./components/ParallelLaneNode";
import EditableTransitionEdge from "./components/EditableTransitionEdge";
import ProblemsPanel from "./components/ProblemsPanel";
import CreateSlotModal from "./components/CreateSlotModal";
// Ausgelagerte Utils (saveScxmlFile statt exportScxmlFile)
import { generateXmlString, saveScxmlFile, saveScxmlFileTauri, openScxmlFileTauri, readScxmlFileContent } from "./utils/scxmlExport";
import { parseScxmlFile, extractBehaviorExitEventsFromScxml } from "./utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "./config/prefixMapping";
import { resolveCollisionScope } from "./utils/nodeCollisions";
import {
    isTauri,
    initApiProxy,
    readWorkflowSource,
} from "./tauri-client.js";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();

const nodeTypes = { custom: CustomNode, slot: SlotNode, submachine: SubMachineNode, parallel: ParallelNode, compound: CompoundNode, parallelLane: ParallelLaneNode, };

// Transition edges stay smart-routed, but selected edges can also be shaped
// with persistent, draggable control points. Keep this mapping at module scope
// so React Flow receives a stable edge component reference between renders.
const edgeTypes = {
    smartTransition: EditableTransitionEdge,
};

const withSmartTransitionRouting = (transitionEdges) =>
    transitionEdges.map((edge) => ({
        ...edge,
        type: "smartTransition",
    }));

const TRANSITION_HIGHLIGHT_COLORS = {
    success: "#22c55e",
    error: "#f59e0b",
    fatal: "#ef4444",
    other: "#38bdf8",
};

// Slot connections intentionally use a separate palette from transition
// semantics so Read/Write stay visually distinct from success/error/fatal.
const SLOT_CONNECTION_COLORS = {
    read: "#6366f1",
    write: "#d946ef",
};

const EDITOR_SHORTCUTS = [
    { keys: "Ctrl + F", action: "Find skill or slot" },
    { keys: "Ctrl + S", action: "Save workflow" },
    { keys: "Ctrl + Shift + S", action: "Save workflow as…" },
    { keys: "Ctrl + Tab", action: "Next workflow tab" },
    { keys: "Ctrl + Shift + Tab", action: "Previous workflow tab" },
    { keys: "Ctrl + Z", action: "Undo" },
    { keys: "Ctrl + Y", action: "Redo" },
    { keys: "Ctrl + C", action: "Copy selected nodes" },
    { keys: "Ctrl + V", action: "Paste copied nodes" },
    { keys: "Ctrl + D", action: "Duplicate selected nodes" },
    { keys: "Ctrl + A", action: "Select all nodes" },
    { keys: "Ctrl + N", action: "New workflow tab" },
    { keys: "Ctrl + W", action: "Close workflow tab" },
    { keys: "Esc", action: "Close overlay / clear selection" },
    { keys: "F", action: "Fit workflow to view" },
    { keys: "Shift + F", action: "Fit selection to view" },
    { keys: "Ctrl + 1", action: "Event mode" },
    { keys: "Ctrl + 2", action: "Slot mode" },
    { keys: "Ctrl + 3", action: "Overview mode" },
];

const FIND_SHORTCUTS = [
    { keys: "↑ / ↓", action: "Move through search results" },
    { keys: "Enter", action: "Focus selected result" },
    { keys: "Esc", action: "Close search" },
];

const getTransitionHighlightColor = (sourceHandle) => {
    const parts = String(sourceHandle || "")
        .trim()
        .toLowerCase()
        .split(".")
        .filter(Boolean);

    const mainType = parts.find((part) =>
        part === "success" || part === "error" || part === "fatal"
    );

    return TRANSITION_HIGHLIGHT_COLORS[mainType || "other"];
};

const TRANSITION_HIGHLIGHT_COLOR_VALUES = new Set(
    Object.values(TRANSITION_HIGHLIGHT_COLORS)
);

const clearTransientTransitionHighlight = (edge) => {
    const style = { ...(edge.style || {}) };
    const markerEnd = edge.markerEnd
        ? { ...edge.markerEnd }
        : edge.markerEnd;

    const hadTransientStroke = TRANSITION_HIGHLIGHT_COLOR_VALUES.has(
        style.stroke
    );
    const hadTransientMarker = Boolean(
        markerEnd &&
        TRANSITION_HIGHLIGHT_COLOR_VALUES.has(markerEnd.color)
    );

    if (hadTransientStroke) {
        delete style.stroke;
    }

    if (hadTransientMarker) {
        delete markerEnd.color;
    }

    return {
        ...edge,
        animated:
            hadTransientStroke || hadTransientMarker
                ? false
                : edge.animated,
        style,
        markerEnd,
    };
};

const highlightSelectedTransitions = (transitionEdges, selectedNodeIds) =>
    transitionEdges.map((rawEdge) => {
        // Selection/highlight styling is display-only. Strip a previously
        // persisted semantic highlight before deciding whether this edge is
        // currently selected. This prevents edited edges from staying coloured
        // after React Flow has deselected them.
        const edge = clearTransientTransitionHighlight(rawEdge);
        const isConnectedToSelection =
            selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
        const isEdgeSelected = Boolean(edge.selected);

        if (!isConnectedToSelection && !isEdgeSelected) {
            return edge;
        }

        const color = getTransitionHighlightColor(edge.sourceHandle || edge.label);

        // Keep the same geometry. Connected transitions animate while a skill
        // is selected, and directly selected transitions use the same semantic
        // success/error/fatal colour.
        return {
            ...edge,
            animated: isConnectedToSelection ? true : edge.animated,
            style: {
                ...(edge.style || {}),
                stroke: color,
            },
            markerEnd: edge.markerEnd
                ? { ...edge.markerEnd, color }
                : edge.markerEnd,
        };
    });


const normalizeSlotPath = (path) =>
    String(path || "").trim().replace(/^\/+/, "");

const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

const extractInheritedSlotsFromScxml = (xmlText) => {
    if (!xmlText) return [];

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        if (xmlDoc.getElementsByTagName("parsererror")[0]) {
            return [];
        }

        const slotData = Array.from(
            xmlDoc.getElementsByTagName("*")
        ).find(
            (element) =>
                element.localName === "data" &&
                element.getAttribute("id") === "#_SLOTS"
        );

        if (!slotData) return [];

        const seenPaths = new Set();

        return Array.from(slotData.getElementsByTagName("*"))
            .filter((element) => element.localName === "inheritSlot")
            .map((element) => ({
                key: element.getAttribute("key") || "",
                state: element.getAttribute("state") || "",
                path: normalizeSlotPath(element.getAttribute("xpath") || ""),
            }))
            .filter((slot) => {
                if (!slot.path || seenPaths.has(slot.path)) return false;
                seenPaths.add(slot.path);
                return true;
            });
    } catch (error) {
        console.warn("Could not parse inheritSlot declarations:", error);
        return [];
    }
};

const collectInheritedSlotUsages = (parsedNodes, declaredSlots = []) => {
    const usages = [];
    const seen = new Set();

    const addUsage = (slot, access, node) => {
        const path = normalizeSlotPath(slot?.path);
        if (!path) return;

        const key = [access || "inherit", path, slot?.key || "", slot?.type || "Unknown"].join("|");
        if (seen.has(key)) return;
        seen.add(key);

        usages.push({
            key: slot?.key || "",
            state:
                slot?.inherited?.state ||
                node?.data?.fullSkillName ||
                node?.data?.label ||
                "",
            path,
            access,
            type: slot?.type || "Unknown",
        });
    };

    (parsedNodes || []).forEach((node) => {
        (node.data?.inSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "read", node);
        });

        (node.data?.outSlots || []).forEach((slot) => {
            if (slot?.inherited) addUsage(slot, "write", node);
        });
    });

    // Keep an inherited slot visible even when its concrete read/write usage
    // cannot be resolved (for example because skill metadata is unavailable).
    (declaredSlots || []).forEach((slot) => {
        const path = normalizeSlotPath(slot?.path);
        if (!path) return;

        const alreadyRepresented = usages.some(
            (usage) => usage.path === path
        );
        if (alreadyRepresented) return;

        usages.push({
            ...slot,
            path,
            access: null,
            type: "Unknown",
        });
    });

    return usages;
};

const isSlotEdge = (edge) =>
    edge?.data?.edgeKind === "slot" ||
    String(edge?.id || "").startsWith("edge-read-") ||
    String(edge?.id || "").startsWith("edge-write-");

const getSlotPathFromNode = (slotNode) =>
    normalizeSlotPath(slotNode?.data?.path || slotNode?.data?.label || "");

const parseSlotConnectionHandle = (handleId) => {
    const value = String(handleId || "");

    const skillRead = value.match(/^slot-skill-read-(\d+)$/);
    if (skillRead) {
        return {
            origin: "skill",
            access: "read",
            slotIndex: Number(skillRead[1]),
        };
    }

    const skillWrite = value.match(/^slot-skill-write-(\d+)$/);
    if (skillWrite) {
        return {
            origin: "skill",
            access: "write",
            slotIndex: Number(skillWrite[1]),
        };
    }

    if (value === "slot-node-read") {
        return { origin: "slot", access: "read", slotIndex: null };
    }

    if (value === "slot-node-write") {
        return { origin: "slot", access: "write", slotIndex: null };
    }

    return null;
};

const getBehaviorSourceKey = (src) => {
    const match = String(src || "")
        .trim()
        .match(/^\$\{([^}]+)\}(?:[\\/]|$)/);

    return match
        ? match[1].trim().toUpperCase()
        : null;
};

const buildEditorProblems = (
    nodes,
    edges,
    globalDataModel,
    behaviorDirectories,
    isBehaviorWorkflow = false
) => {
    const problems = [];
    const nodeMap = new Map((nodes || []).map((node) => [node.id, node]));

    const nodeLabel = (node) =>
        node?.data?.label ||
        node?.data?.fullSkillName ||
        node?.id ||
        "Unknown state";

    const baseNodeName = (node) =>
        String(
            node?.data?.fullSkillName ||
            node?.data?.label ||
            ""
        )
            .split("#")[0]
            .split(".")
            .pop()
            .toLowerCase();

    const isValidBehaviorTerminal = (node) => {
        const name = baseNodeName(node);

        return (
            Boolean(node?.data?.isFinal) ||
            Boolean(node?.data?.isBehaviorExit) ||
            name === "end" ||
            name === "fatal"
        );
    };

    const addProblem = (problem) => {
        problems.push({
            severity: "error",
            category: "Workflow",
            focusNodeIds: problem.nodeId ? [problem.nodeId] : [],
            ...problem,
        });
    };

    // Workflow
    const rootNodes = (nodes || []).filter(
        (node) =>
            !node.parentId &&
            node.type !== "slot" &&
            node.type !== "parallelLane"
    );

    if (rootNodes.length > 0) {
        const initialNodes = rootNodes.filter((node) => node.data?.isInitial);

        if (initialNodes.length === 0) {
            addProblem({
                id: "workflow-no-initial",
                severity: "warning",
                category: "Workflow",
                title: "No initial state",
                message: "No root state is marked as initial.",
            });
        } else if (initialNodes.length > 1) {
            initialNodes.forEach((node) => {
                addProblem({
                    id: `workflow-multiple-initial-${node.id}`,
                    category: "Workflow",
                    title: "Multiple initial states",
                    message: `${nodeLabel(node)} is one of multiple initial states.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            });
        }
    }

    // Every compound state requires exactly one immediate initial child.
    (nodes || [])
        .filter(
            (node) => node.type === "compound" && !node.data?.isCollapsed
        )
        .forEach((compound) => {
            const children = (nodes || []).filter(
                (node) =>
                    node.parentId === compound.id &&
                    isCompoundInitialChildCandidate(node)
            );
            const initialChildren = children.filter(
                (node) => node.data?.isInitial
            );

            if (children.length === 0) {
                addProblem({
                    id: `compound-empty-${compound.id}`,
                    category: "Workflow",
                    title: "Compound needs an initial state",
                    message: `${nodeLabel(compound)} does not contain a state that can be initial.`,
                    nodeId: compound.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
                return;
            }

            if (initialChildren.length !== 1) {
                addProblem({
                    id: `compound-initial-${compound.id}`,
                    category: "Workflow",
                    title: "Compound needs one initial state",
                    message: `${nodeLabel(compound)} must have exactly one initial child state.`,
                    nodeId: compound.id,
                    detailTab: "allgemein",
                    mode: "event",
                    focusNodeIds: [
                        compound.id,
                        ...initialChildren.map(
                            (node) => node.id
                        ),
                    ],
                });
            }
        });

    // Datamodel
    const ids = new Map();
    (globalDataModel || []).forEach((entry) => {
        const id = String(entry?.id || "").trim();
        if (!id) return;
        ids.set(id, (ids.get(id) || 0) + 1);
    });

    ids.forEach((count, id) => {
        if (count > 1) {
            addProblem({
                id: `datamodel-duplicate-${id}`,
                category: "Datamodel",
                title: "Duplicate datamodel ID",
                message: `${id} is defined ${count} times.`,
            });
        }
    });

    // Transitions
    (edges || []).forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        const eventName = edge.sourceHandle || edge.label || "transition";

        if (!source) {
            addProblem({
                id: `transition-missing-source-${edge.id}`,
                category: "Transitions",
                title: "Missing transition source",
                message: `${eventName} starts from a state that no longer exists.`,
                edgeId: edge.id,
                mode: "event",
                focusNodeIds: target ? [target.id] : [],
            });
            return;
        }

        if (!target) {
            addProblem({
                id: `transition-missing-target-${edge.id}`,
                category: "Transitions",
                title: "Missing transition target",
                message: `${nodeLabel(source)}.${eventName} points to a state that no longer exists.`,
                nodeId: source.id,
                edgeId: edge.id,
                detailTab: "allgemein",
                mode: "event",
            });
        }

        if (
            edge.sourceHandle &&
            !(source.data?.events || []).some(
                (event) => event?.id === edge.sourceHandle
            )
        ) {
            addProblem({
                id: `transition-unknown-event-${edge.id}`,
                severity: "warning",
                category: "Transitions",
                title: "Unknown exit token",
                message: `${nodeLabel(source)} does not expose ${edge.sourceHandle}.`,
                nodeId: source.id,
                edgeId: edge.id,
                detailTab: "allgemein",
                mode: "event",
                focusNodeIds: target
                    ? [source.id, target.id]
                    : [source.id],
            });
        }
    });

    // Missing transitions / exit-token coverage.
    // Every exposed event must have an outgoing transition. A connected "*"
    // handle is a catch-all and therefore covers every possible event.
    (nodes || []).forEach((node) => {
        if (isValidBehaviorTerminal(node)) return;

        const exposedEventIds = [
            ...new Set(
                (node.data?.events || [])
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            ),
        ];

        if (exposedEventIds.length === 0) return;

        const outgoingEventIds = new Set(
            (edges || [])
                .filter((edge) => edge.source === node.id)
                .map((edge) =>
                    String(edge.sourceHandle || edge.label || "").trim()
                )
                .filter(Boolean)
        );

        // A wildcard transition handles every event emitted by this state.
        if (outgoingEventIds.has("*")) return;

        exposedEventIds
            .filter((eventId) => eventId !== "*")
            .forEach((eventId) => {
                if (outgoingEventIds.has(eventId)) return;

                addProblem({
                    id: `transition-missing-${node.id}-${eventId}`,
                    category: "Transitions",
                    title: "Missing transition",
                    message: `${nodeLabel(node)}.${eventId} has no transition.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            });
    });

    // Required parameters
    (nodes || []).forEach((node) => {
        (node.data?.params || []).forEach((parameter, index) => {
            if (!parameter?.required) return;

            const value = String(parameter.expr ?? "").trim();
            const defaultValue = String(parameter.default ?? "").trim();

            if (!value && !defaultValue) {
                addProblem({
                    id: `parameter-required-${node.id}-${index}`,
                    category: "Parameters",
                    title: "Required parameter is missing",
                    message: `${nodeLabel(node)}.${parameter.key || `parameter ${index + 1}`} needs a value.`,
                    nodeId: node.id,
                    detailTab: "parameter",
                    mode: "event",
                });
            }
        });
    });

    // Behavior Library source validation.
    const configuredBehaviorKeys = new Set(
        (behaviorDirectories || [])
            .map((directory) =>
                String(directory?.key || "")
                    .trim()
                    .toUpperCase()
            )
            .filter(Boolean)
    );

    (nodes || []).forEach((node) => {
        if (node.type !== "submachine") return;

        const src = String(node.data?.src || "").trim();
        if (!src) return;

        const sourceKey = getBehaviorSourceKey(src);
        if (!sourceKey) return;

        if (!configuredBehaviorKeys.has(sourceKey)) {
            addProblem({
                id: `behavior-library-key-${node.id}-${sourceKey}`,
                severity: "warning",
                category: "Behavior Library",
                title: "Behavior Library key is not configured",
                message: `${nodeLabel(node)} sources ${src}, but ${sourceKey} is not defined in the Behavior Library.`,
                nodeId: node.id,
                detailTab: "allgemein",
                mode: "event",
            });
        }
    });

    // A sourced behavior must have a way to leave the state machine.
    // Valid terminals are End, Fatal, or a Nop forwarding node that sends
    // an event outside the sub-state-machine.
    if (isBehaviorWorkflow) {
        const stateNodes = (nodes || []).filter(
            (node) =>
                node.type !== "slot" &&
                node.type !== "parallelLane"
        );

        const hasValidTerminal = stateNodes.some(
            isValidBehaviorTerminal
        );

        if (stateNodes.length > 0 && !hasValidTerminal) {
            addProblem({
                id: "behavior-exit-missing",
                severity: "warning",
                category: "Behavior exits",
                title: "State machine has no exit",
                message:
                    "A sourced state machine must send an event outward through Nop or end in End/Fatal.",
            });
        }

        const childrenByParent = new Map();
        stateNodes.forEach((node) => {
            if (!node.parentId) return;
            if (!childrenByParent.has(node.parentId)) {
                childrenByParent.set(node.parentId, []);
            }
            childrenByParent.get(node.parentId).push(node.id);
        });

        stateNodes.forEach((node) => {
            // Containers terminate through their children.
            if ((childrenByParent.get(node.id) || []).length > 0) {
                return;
            }

            if (isValidBehaviorTerminal(node)) {
                return;
            }

            const hasOutgoingTransition = (edges || []).some(
                (edge) => edge.source === node.id
            );

            if (!hasOutgoingTransition) {
                addProblem({
                    id: `behavior-dead-end-${node.id}`,
                    severity: "warning",
                    category: "Behavior exits",
                    title: "State machine can stop without an exit",
                    message: `${nodeLabel(node)} has no outgoing transition. Use a Nop forwarding exit or End/Fatal if this path should leave the state machine.`,
                    nodeId: node.id,
                    detailTab: "allgemein",
                    mode: "event",
                });
            }
        });
    }

    // Slots
    const readers = new Map();
    const writers = new Map();

    const registerSlot = (map, path, value) => {
        if (!map.has(path)) map.set(path, []);
        map.get(path).push(value);
    };

    (nodes || []).forEach((node) => {
        (node.data?.inSlots || []).forEach((slot, index) => {
            const path = normalizeSlotPath(slot.path);

            if (!path) {
                addProblem({
                    id: `slot-input-empty-${node.id}-${index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Input slot is not connected",
                    message: `${nodeLabel(node)}.${slot.key || `input ${index + 1}`} has no slot path.`,
                    nodeId: node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
                return;
            }

            registerSlot(readers, path, { node, slot, index });
        });

        (node.data?.outSlots || []).forEach((slot, index) => {
            const path = normalizeSlotPath(slot.path);

            if (!path) {
                addProblem({
                    id: `slot-output-empty-${node.id}-${index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Output slot is not connected",
                    message: `${nodeLabel(node)}.${slot.key || `output ${index + 1}`} has no slot path.`,
                    nodeId: node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
                return;
            }

            registerSlot(writers, path, { node, slot, index });
        });
    });

    const paths = new Set([...readers.keys(), ...writers.keys()]);

    paths.forEach((path) => {
        const pathReaders = readers.get(path) || [];
        const pathWriters = writers.get(path) || [];

        pathReaders.forEach((reader) => {
            pathWriters.forEach((writer) => {
                const inputType = normalizeSlotType(reader.slot?.type);
                const outputType = normalizeSlotType(writer.slot?.type);

                if (
                    inputType &&
                    outputType &&
                    inputType !== outputType
                ) {
                    addProblem({
                        id: `slot-type-${path}-${reader.node.id}-${reader.index}-${writer.node.id}-${writer.index}`,
                        category: "Slots",
                        title: "Slot type mismatch",
                        message: `/${path}: ${nodeLabel(writer.node)}.${writer.slot?.key} (${writer.slot?.type}) → ${nodeLabel(reader.node)}.${reader.slot?.key} (${reader.slot?.type}).`,
                        nodeId: reader.node.id,
                        detailTab: "slots",
                        mode: "overview",
                        focusNodeIds: [writer.node.id, reader.node.id],
                    });
                }
            });
        });

        if (pathReaders.length > 0 && pathWriters.length === 0) {
            pathReaders.forEach((reader) => {
                addProblem({
                    id: `slot-no-writer-${path}-${reader.node.id}-${reader.index}`,
                    severity: "warning",
                    category: "Slots",
                    title: "Slot has no writer",
                    message: `/${path} is read by ${nodeLabel(reader.node)}, but no skill writes to it.`,
                    nodeId: reader.node.id,
                    detailTab: "slots",
                    mode: "overview",
                });
            });
        }

    });

    const severityOrder = { error: 0, warning: 1, info: 2 };

    return problems.sort(
        (a, b) =>
            (severityOrder[a.severity] ?? 99) -
            (severityOrder[b.severity] ?? 99) ||
            String(a.category).localeCompare(String(b.category)) ||
            String(a.title).localeCompare(String(b.title))
    );
};

const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

const PARALLEL_EXIT_GUTTER = 150;
const PARALLEL_NODE_GAP = 30;
const COMPOUND_NODE_GAP = 30;
const COMPOUND_PADDING_X = 30;
const COMPOUND_HEADER_HEIGHT = 45;
const COMPOUND_BOTTOM_PADDING = 30;
const COMPOUND_EXIT_GUTTER_MIN = 220;
const COMPOUND_EXIT_GUTTER_MAX = 420;

const getCompoundExitLabel = (event) =>
    String(
        event?.name ||
        event?.rawEvent ||
        event?.transitionHandleId ||
        event?.id ||
        ""
    ).trim();

const getCompoundExitGutterWidth = (events = []) => {
    const longestLabelLength = (events || []).reduce(
        (maxLength, event) =>
            Math.max(maxLength, getCompoundExitLabel(event).length),
        0
    );

    // Roughly one character width plus label padding, both handles and some
    // breathing room. Keep a generous minimum so child nodes never sit below
    // the compound's exit controls.
    const estimatedWidth = 72 + longestLabelLength * 7.2;

    return Math.max(
        COMPOUND_EXIT_GUTTER_MIN,
        Math.min(COMPOUND_EXIT_GUTTER_MAX, estimatedWidth)
    );
};

const getCompoundChildrenRight = (compoundId, allNodes = []) =>
    (allNodes || [])
        .filter((node) => node.parentId === compoundId)
        .reduce((right, node) => {
            const size = getNodeSize(node);
            return Math.max(
                right,
                Number(node.position?.x || 0) + size.width
            );
        }, COMPOUND_PADDING_X);

const getNodeSize = (node) => ({
    // Explicit dimensions written by NodeResizer / auto-fit must win over a
    // possibly stale React Flow measurement from the previous render.
    width: Number(node?.width) || Number(node?.style?.width) || Number(node?.measured?.width) || 210,
    height: Number(node?.height) || Number(node?.style?.height) || Number(node?.measured?.height) || 80,
});

const withNodeDimensions = (node, width, height) => ({
    ...node,
    width,
    height,
    style: {
        ...(node.style || {}),
        width,
        height,
    },
});

const getDirectCompoundForNode = (node, allNodes) => {
    if (!node?.parentId) return null;
    const parent = allNodes.find((candidate) => candidate.id === node.parentId);
    return parent?.type === "compound" ? parent : null;
};

const fitCompoundToChildren = (allNodes, compoundId) => {
    const compound = (allNodes || []).find((node) => node.id === compoundId);
    if (!compound || compound.type !== "compound") return allNodes;

    const members = allNodes.filter((node) => node.parentId === compoundId);

    let right = COMPOUND_PADDING_X;
    let bottom = COMPOUND_HEADER_HEIGHT;

    members.forEach((member) => {
        const size = getNodeSize(member);
        right = Math.max(
            right,
            Number(member.position?.x || 0) + size.width
        );
        bottom = Math.max(
            bottom,
            Number(member.position?.y || 0) + size.height
        );
    });

    const requiredWidth = Math.max(
        320,
        right +
        COMPOUND_PADDING_X +
        getCompoundExitGutterWidth(compound.data?.events || [])
    );
    const requiredHeight = Math.max(
        180,
        bottom + COMPOUND_BOTTOM_PADDING
    );

    return allNodes.map((node) => {
        if (node.id !== compoundId) return node;

        const currentSize = getNodeSize(node);

        if (node.data?.isCollapsed) {
            const savedExpanded = node.data?.expandedContainerSize || {};
            const expandedWidth = Math.max(
                Number(savedExpanded.width) || 0,
                currentSize.width,
                requiredWidth
            );
            const expandedHeight = Math.max(
                Number(savedExpanded.height) || 0,
                requiredHeight
            );

            // Keep the compact collapsed height on screen, but remember a
            // large enough expanded size for all children. Manual resizing
            // therefore becomes a minimum size rather than disabling auto-grow.
            return {
                ...withNodeDimensions(node, expandedWidth, currentSize.height),
                data: {
                    ...(node.data || {}),
                    expandedContainerSize: {
                        ...savedExpanded,
                        width: expandedWidth,
                        height: expandedHeight,
                    },
                },
            };
        }

        const width = Math.max(currentSize.width, requiredWidth);
        const height = Math.max(currentSize.height, requiredHeight);

        return withNodeDimensions(node, width, height);
    });
};

const fitCompoundAndAncestorCompounds = (allNodes, compoundId) => {
    let nextNodes = allNodes;
    let currentId = compoundId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        nextNodes = fitCompoundToChildren(nextNodes, currentId);

        const current = nextNodes.find((node) => node.id === currentId);
        if (!current?.parentId) break;

        const parent = nextNodes.find((node) => node.id === current.parentId);
        currentId = parent?.type === "compound" ? parent.id : null;
    }

    // A compound can itself live in a parallel lane. If it grows, the lane
    // and enclosing parallel must grow too instead of clipping the compound.
    const fittedCompound = nextNodes.find((node) => node.id === compoundId);
    const lane = fittedCompound
        ? getLaneForNode(fittedCompound, nextNodes)
        : null;

    if (lane?.parentId) {
        nextNodes = growParallelToLaneContents(nextNodes, lane.parentId);
    }

    return nextNodes;
};

const getAbsoluteNodePosition = (node, allNodes) => {
    let x = node?.position?.x || 0;
    let y = node?.position?.y || 0;
    let parentId = node?.parentId;
    const visited = new Set();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);

        const parent = allNodes.find(
            (candidate) => candidate.id === parentId
        );

        if (!parent) break;

        x += parent.position?.x || 0;
        y += parent.position?.y || 0;
        parentId = parent.parentId;
    }

    return { x, y };
};

const getLaneForNode = (node, allNodes) => {
    let current = node;
    const visited = new Set();

    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);

        const parent = allNodes.find(
            (candidate) => candidate.id === current.parentId
        );

        if (!parent) return null;
        if (parent.type === "parallelLane") return parent;

        current = parent;
    }

    return null;
};

const getEnclosingStateContainers = (node, allNodes = []) => {
    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const containers = [];
    const visited = new Set();
    let parentId = node?.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;

        if (parent.type === "compound" || parent.type === "parallel") {
            containers.push(parent);
        }

        parentId = parent.parentId;
    }

    return containers;
};

const isNodeInsideContainer = (node, containerId, allNodes = []) => {
    if (!node || !containerId) return false;

    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const visited = new Set();
    let parentId = node.parentId;

    while (parentId && !visited.has(parentId)) {
        if (parentId === containerId) return true;

        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        parentId = parent.parentId;
    }

    return false;
};

const getNodeNestingDepth = (node, allNodes = []) => {
    const byId = new Map(
        (allNodes || []).map((candidate) => [candidate.id, candidate])
    );
    const visited = new Set();
    let depth = 0;
    let parentId = node?.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        depth += 1;
        parentId = parent.parentId;
    }

    return depth;
};

// A normal transition may only target an interior state when its source is
// already inside every compound/parallel boundary surrounding that target.
// This prevents transitions from jumping across a state boundary directly to
// one of its children; external transitions must target the container itself.
const canTargetAcrossStateBoundaries = (sourceNode, targetNode, allNodes = []) =>
    getEnclosingStateContainers(targetNode, allNodes).every((container) =>
        isNodeInsideContainer(sourceNode, container.id, allNodes)
    );

const getTransitionTargetHandleForNode = (node) =>
    node?.type === "parallel" ? "target" : "transition-target";

const getDescendantNodeIds = (rootId, allNodes = []) => {
    const childrenByParent = new Map();

    (allNodes || []).forEach((node) => {
        if (!node?.parentId) return;
        if (!childrenByParent.has(node.parentId)) {
            childrenByParent.set(node.parentId, []);
        }
        childrenByParent.get(node.parentId).push(node.id);
    });

    const descendants = new Set();
    const queue = [...(childrenByParent.get(rootId) || [])];

    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || descendants.has(id)) continue;
        descendants.add(id);
        queue.push(...(childrenByParent.get(id) || []));
    }

    return descendants;
};

const orderNodesParentsFirst = (allNodes) => {
    const byId = new Map(
        allNodes.map((node) => [node.id, node])
    );

    const getDepth = (node) => {
        let depth = 0;
        let parentId = node.parentId;
        const visited = new Set();

        while (
            parentId &&
            byId.has(parentId) &&
            !visited.has(parentId)
            ) {
            visited.add(parentId);
            depth += 1;
            parentId = byId.get(parentId).parentId;
        }

        return depth;
    };

    return allNodes
        .map((node, index) => ({
            node,
            index,
            depth: getDepth(node),
        }))
        .sort((a, b) => a.depth - b.depth || a.index - b.index)
        .map(({ node }) => node);
};

const isCompoundInitialChildCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane"
    );

// Any real SCXML state can be a branch state in a parallel lane. Structural
// states (compound/parallel) therefore participate exactly like skills. The
// automatically managed lane wrapper itself is excluded so it never tries to
// wrap itself.
const isParallelLaneSkillCandidate = (node) =>
    Boolean(
        node &&
        node.type !== "slot" &&
        node.type !== "parallelLane" &&
        !(
            node.type === "compound" &&
            (
                node.data?.autoParallelLaneCompound ||
                node.className === "compound-in-lane"
            )
        )
    );

const isAutoParallelLaneCompound = (node) =>
    Boolean(
        node &&
        node.type === "compound" &&
        (
            node.data?.autoParallelLaneCompound ||
            node.className === "compound-in-lane"
        )
    );

// Children that live inside state containers should still be able to enlarge
// their parent after that parent has been manually resized. React Flow's
// expandParent support handles the live drag case; our explicit fit helpers
// below handle drops/reparenting and nested containers.
const normalizeContainerAutoExpansion = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) return allNodes;

    const byId = new Map(allNodes.map((node) => [node.id, node]));
    let changed = false;

    const nextNodes = allNodes.map((node) => {
        if (!node.parentId) return node;

        const parent = byId.get(node.parentId);
        const shouldExpandParent =
            parent?.type === "compound" ||
            parent?.type === "parallel" ||
            parent?.type === "parallelLane";

        if (!shouldExpandParent || node.expandParent === true) {
            return node;
        }

        changed = true;
        return {
            ...node,
            expandParent: true,
        };
    });

    return changed ? nextNodes : allNodes;
};

// Grow a parallel state (and its lanes / automatic lane compounds) just enough
// to contain the current lane contents. Existing dimensions are floors, so a
// user resize is preserved while automatic layout may still make the state
// larger later.
const growParallelToLaneContents = (allNodes, parallelId) => {
    let nextNodes = allNodes;
    const parallel = nextNodes.find((node) => node.id === parallelId);
    if (!parallel || parallel.type !== "parallel") return nextNodes;

    const parallelLanes = nextNodes
        .filter(
            (node) =>
                node.type === "parallelLane" &&
                node.parentId === parallel.id
        )
        .sort(
            (a, b) =>
                Number(a.position?.y || 0) -
                Number(b.position?.y || 0)
        );

    if (parallelLanes.length === 0) return nextNodes;

    // Fit automatic lane compounds first, because their required dimensions
    // determine how large the surrounding lane and parallel must become.
    parallelLanes.forEach((lane) => {
        const wrapper = nextNodes.find(
            (node) =>
                node.parentId === lane.id &&
                isAutoParallelLaneCompound(node)
        );

        if (wrapper) {
            nextNodes = fitCompoundToChildren(nextNodes, wrapper.id);
        }
    });

    const currentParallelSize = getNodeSize(
        nextNodes.find((node) => node.id === parallel.id) || parallel
    );

    let requiredParallelWidth = Math.max(420, currentParallelSize.width);
    const laneHeights = new Map();

    parallelLanes.forEach((originalLane) => {
        const lane =
            nextNodes.find((node) => node.id === originalLane.id) ||
            originalLane;
        const currentLaneSize = getNodeSize(lane);
        const laneChildren = nextNodes.filter(
            (node) => node.parentId === lane.id
        );
        const wrapper = laneChildren.find(isAutoParallelLaneCompound);
        const laneMembers = wrapper
            ? [wrapper]
            : laneChildren.filter(isParallelLaneSkillCandidate);

        let maxRight = 0;
        let maxBottom = 0;

        laneMembers.forEach((member) => {
            const size = getNodeSize(member);
            maxRight = Math.max(
                maxRight,
                Number(member.position?.x || 0) + size.width
            );
            maxBottom = Math.max(
                maxBottom,
                Number(member.position?.y || 0) + size.height
            );
        });

        const requiredLaneWidth = wrapper
            ? Math.max(420, maxRight)
            : Math.max(420, 15 + maxRight + PARALLEL_EXIT_GUTTER);
        const requiredLaneHeight = wrapper
            ? Math.max(140, maxBottom)
            : Math.max(110, maxBottom + 20);

        requiredParallelWidth = Math.max(
            requiredParallelWidth,
            currentLaneSize.width,
            requiredLaneWidth
        );
        laneHeights.set(
            lane.id,
            Math.max(currentLaneSize.height, requiredLaneHeight)
        );
    });

    const firstLaneY = Math.max(
        40,
        Number(parallelLanes[0]?.position?.y || 40)
    );
    let nextLaneY = firstLaneY;
    const laneGeometry = new Map();

    parallelLanes.forEach((lane) => {
        const height = laneHeights.get(lane.id) || 110;
        laneGeometry.set(lane.id, {
            y: nextLaneY,
            width: requiredParallelWidth,
            height,
        });
        nextLaneY += height;
    });

    const requiredParallelHeight = Math.max(
        180,
        currentParallelSize.height,
        nextLaneY + 35
    );

    return nextNodes.map((node) => {
        if (node.id === parallel.id) {
            return withNodeDimensions(
                node,
                requiredParallelWidth,
                requiredParallelHeight
            );
        }

        const geometry = laneGeometry.get(node.id);
        if (geometry) {
            return {
                ...withNodeDimensions(
                    node,
                    geometry.width,
                    geometry.height
                ),
                position: {
                    ...node.position,
                    x: 0,
                    y: geometry.y,
                },
                expandParent: true,
            };
        }

        if (
            isAutoParallelLaneCompound(node) &&
            laneGeometry.has(node.parentId)
        ) {
            const laneSize = laneGeometry.get(node.parentId);
            return {
                ...withNodeDimensions(
                    node,
                    laneSize.width,
                    laneSize.height
                ),
                expandParent: true,
            };
        }

        return node;
    });
};

// Re-evaluate all nested state containers from the inside out. Because the
// individual fit functions are grow-only, this is stable and lets a resize of
// any child propagate through Compound -> Parallel -> Compound chains.
const growAllStateContainersToContents = (allNodes) => {
    let nextNodes = allNodes;

    const containers = (allNodes || [])
        .filter(
            (node) =>
                node.type === "compound" ||
                node.type === "parallel"
        )
        .sort(
            (a, b) =>
                getNodeNestingDepth(b, allNodes) -
                getNodeNestingDepth(a, allNodes)
        );

    containers.forEach((container) => {
        if (container.type === "compound") {
            nextNodes = fitCompoundToChildren(nextNodes, container.id);
        } else {
            nextNodes = growParallelToLaneContents(
                nextNodes,
                container.id
            );
        }
    });

    return nextNodes;
};

const NODE_COLLISION_OPTIONS = {
    // Match the React Flow example: keep resolving until the scope is clear.
    maxIterations: Infinity,
    overlapThreshold: 0.5,
    margin: 15,
};

const resolveNodeCollisionsAndRefit = (allNodes, focusNodeId) => {
    let nextNodes = resolveCollisionScope(
        allNodes,
        focusNodeId,
        NODE_COLLISION_OPTIONS
    );

    const focusNode = nextNodes.find((node) => node.id === focusNodeId);
    if (!focusNode?.parentId) {
        return orderNodesParentsFirst(nextNodes);
    }

    const parent = nextNodes.find(
        (node) => node.id === focusNode.parentId
    );

    // The reference collision solver is intentionally unbounded. Inside our
    // subflows that could push a sibling through the parent's left/top edge.
    // Shift the whole resolved sibling group together so its relative spacing
    // stays intact while respecting the container's content inset.
    const minContentX =
        parent?.type === "compound" ? COMPOUND_PADDING_X : 20;
    const minContentY =
        parent?.type === "compound" ? COMPOUND_HEADER_HEIGHT : 20;
    const siblings = nextNodes.filter(
        (node) =>
            (node.parentId || null) === (focusNode.parentId || null) &&
            node.type !== "parallelLane"
    );

    if (siblings.length > 0) {
        const currentMinX = Math.min(
            ...siblings.map((node) => Number(node.position?.x || 0))
        );
        const currentMinY = Math.min(
            ...siblings.map((node) => Number(node.position?.y || 0))
        );
        const shiftX = Math.max(0, minContentX - currentMinX);
        const shiftY = Math.max(0, minContentY - currentMinY);

        if (shiftX > 0 || shiftY > 0) {
            const siblingIds = new Set(siblings.map((node) => node.id));
            nextNodes = nextNodes.map((node) =>
                siblingIds.has(node.id)
                    ? {
                        ...node,
                        position: {
                            x: Number(node.position?.x || 0) + shiftX,
                            y: Number(node.position?.y || 0) + shiftY,
                        },
                    }
                    : node
            );
        }
    }

    // Collision resolution can move a child farther than the container's
    // previous bounds. Re-run the existing grow logic afterwards so compound
    // and parallel layouts remain valid instead of clipping the moved nodes.
    if (parent?.type === "compound") {
        nextNodes = fitCompoundAndAncestorCompounds(
            nextNodes,
            parent.id
        );
    } else if (parent?.type === "parallelLane" && parent.parentId) {
        nextNodes = growParallelToLaneContents(
            nextNodes,
            parent.parentId
        );
    }

    return orderNodesParentsFirst(nextNodes);
};

/*
 * Parallel lanes use an automatically managed compound whenever they contain
 * more than one executable state. It is a normal compound from the editor's
 * point of view (visible, selectable, with an initial child and entry edge);
 * the autoParallelLaneCompound flag is only used for lane bookkeeping.
 *
 * 0 states -> no wrapper unless a compound already exists
 * 1 state  -> direct child unless a compound already exists
 * 2+       -> all states live inside one normal compound
 * Existing compounds are never auto-dissolved.
 */
const getNextParallelLaneCompoundName = (allNodes) => {
    const usedNames = new Set(
        (allNodes || [])
            .flatMap((node) => [node.data?.label, node.data?.fullSkillName])
            .filter(Boolean)
            .map(String)
    );

    let index = 1;
    while (usedNames.has(`lane_${index}`)) {
        index += 1;
    }

    return `lane_${index}`;
};

const normalizeParallelLaneCompounds = (allNodes) => {
    if (!Array.isArray(allNodes) || allNodes.length === 0) {
        return allNodes;
    }

    let nextNodes = allNodes;
    let changed = false;

    const lanes = allNodes.filter((node) => node.type === "parallelLane");

    lanes.forEach((lane) => {
        const currentById = new Map(nextNodes.map((node) => [node.id, node]));
        const currentLane = currentById.get(lane.id);
        if (!currentLane) return;

        const directChildren = nextNodes.filter(
            (node) => node.parentId === currentLane.id
        );

        const wrappers = directChildren.filter(
            (node) => isAutoParallelLaneCompound(node)
        );

        // There should only ever be one automatic lane compound. If an old
        // file contains more than one, the first is kept and the others are
        // merged into it below.
        let wrapper = wrappers[0] || null;
        const extraWrapperIds = new Set(wrappers.slice(1).map((node) => node.id));

        const directSkills = directChildren.filter(isParallelLaneSkillCandidate);
        const wrappedSkills = wrapper
            ? nextNodes.filter(
                (node) =>
                    node.parentId === wrapper.id &&
                    isParallelLaneSkillCandidate(node)
            )
            : [];
        const extraWrappedSkills = nextNodes.filter(
            (node) =>
                extraWrapperIds.has(node.parentId) &&
                isParallelLaneSkillCandidate(node)
        );

        const allSkills = [
            ...wrappedSkills,
            ...extraWrappedSkills,
            ...directSkills,
        ].filter(
            (node, index, values) =>
                values.findIndex((candidate) => candidate.id === node.id) === index
        );

        // A lane with zero/one direct state does not need an automatically
        // managed compound. Existing lane compounds are deliberately kept.
        if (!wrapper && allSkills.length <= 1) {
            return;
        }

        const laneWidth = Number(currentLane.style?.width) || 420;
        const laneHeight = Number(currentLane.style?.height) || 140;

        /*
         * If the lane already contains a normal compound and another sibling
         * state is added, that existing compound becomes the lane compound.
         * Do NOT create another compound around it. This keeps the region
         * structure flat:
         *
         *   lane -> compound -> states
         *
         * instead of:
         *
         *   lane -> auto compound -> existing compound -> states
         */
        if (!wrapper && allSkills.length > 1) {
            const existingDirectCompound = directSkills.find(
                (node) => node.type === "compound"
            );

            if (existingDirectCompound) {
                const oldWrapperPosition = existingDirectCompound.position || {
                    x: 0,
                    y: 0,
                };
                const existingChildren = nextNodes.filter(
                    (node) =>
                        node.parentId === existingDirectCompound.id &&
                        isCompoundInitialChildCandidate(node)
                );
                const siblingsToAbsorb = directSkills.filter(
                    (node) => node.id !== existingDirectCompound.id
                );
                const compoundChildren = [
                    ...existingChildren,
                    ...siblingsToAbsorb,
                ].filter(
                    (node, index, values) =>
                        values.findIndex(
                            (candidate) => candidate.id === node.id
                        ) === index
                );

                const storedInitialId =
                    existingDirectCompound.data?.initialChildId;
                const initialChild =
                    compoundChildren.find(
                        (node) => node.id === storedInitialId
                    ) ||
                    compoundChildren.find((node) => node.data?.isInitial) ||
                    compoundChildren[0] ||
                    null;
                const desiredInitialId = initialChild?.id || null;
                const siblingIds = new Set(
                    siblingsToAbsorb.map((node) => node.id)
                );

                const existingCompoundSize = getNodeSize(existingDirectCompound);
                const promotedWidth = Math.max(laneWidth, existingCompoundSize.width);
                const promotedHeight = Math.max(laneHeight, existingCompoundSize.height);

                nextNodes = nextNodes.map((node) => {
                    if (node.id === existingDirectCompound.id) {
                        return {
                            ...node,
                            position: { x: 0, y: 0 },
                            parentId: currentLane.id,
                            extent: "parent",
                            expandParent: true,
                            draggable: true,
                            selectable: true,
                            width: promotedWidth,
                            height: promotedHeight,
                            style: {
                                ...node.style,
                                width: promotedWidth,
                                height: promotedHeight,
                            },
                            data: {
                                ...node.data,
                                initialChildId: desiredInitialId,
                                autoParallelLaneCompound: true,
                            },
                        };
                    }

                    // Moving the compound itself to the lane origin must not
                    // visually move children it already contained.
                    if (node.parentId === existingDirectCompound.id) {
                        return {
                            ...node,
                            position: {
                                x:
                                    Number(oldWrapperPosition.x || 0) +
                                    Number(node.position?.x || 0),
                                y:
                                    Number(oldWrapperPosition.y || 0) +
                                    Number(node.position?.y || 0),
                            },
                            data: {
                                ...node.data,
                                isInitial: node.id === desiredInitialId,
                            },
                        };
                    }

                    if (siblingIds.has(node.id)) {
                        return {
                            ...node,
                            parentId: existingDirectCompound.id,
                            extent: "parent",
                            expandParent: true,
                            data: {
                                ...node.data,
                                isInitial: node.id === desiredInitialId,
                            },
                        };
                    }

                    return node;
                });

                changed = true;
                return;
            }
        }

        if (!wrapper) {
            const wrapperId = getNodeId();
            const initialSkill =
                allSkills.find((node) => node.data?.isInitial) || allSkills[0];

            // This is the compound that represents the parallel region/lane,
            // so its default name should make that role explicit.
            const compoundName = getNextParallelLaneCompoundName(nextNodes);

            const autoWrapper = {
                id: wrapperId,
                type: "compound",
                position: { x: 0, y: 0 },
                parentId: currentLane.id,
                extent: "parent",
                expandParent: true,
                draggable: true,
                selectable: true,
                width: laneWidth,
                height: laneHeight,
                style: {
                    width: laneWidth,
                    height: laneHeight,
                },
                data: {
                    label: compoundName,
                    fullSkillName: compoundName,
                    isInitial: false,
                    initialChildId: initialSkill.id,
                    events: [],
                    onEntry: [],
                    onExit: [],
                    autoParallelLaneCompound: true,
                },
            };

            nextNodes = [
                ...nextNodes,
                autoWrapper,
            ].map((node) => {
                if (!allSkills.some((skill) => skill.id === node.id)) {
                    return node;
                }

                return {
                    ...node,
                    parentId: wrapperId,
                    extent: "parent",
                    expandParent: true,
                    // Wrapper starts at the lane origin, so the visual position
                    // stays exactly where the skill was before wrapping.
                    position: {
                        x: Number(node.position?.x || 0),
                        y: Number(node.position?.y || 0),
                    },
                    data: {
                        ...node.data,
                        isInitial: node.id === initialSkill.id,
                    },
                };
            });

            changed = true;
            return;
        }

        // Existing lane compound: keep it as the single region compound and
        // absorb direct lane states or children of duplicate wrappers into it.
        const wrapperPosition = wrapper.position || { x: 0, y: 0 };
        const currentInitialId = wrapper.data?.initialChildId;
        const initialSkill =
            allSkills.find((node) => node.id === currentInitialId) ||
            allSkills.find((node) => node.data?.isInitial) ||
            allSkills[0] ||
            null;

        const needsMerge =
            directSkills.length > 0 ||
            extraWrappedSkills.length > 0 ||
            extraWrapperIds.size > 0;
        const wrapperSize = getNodeSize(wrapper);
        const desiredWrapperWidth = Math.max(laneWidth, wrapperSize.width);
        const desiredWrapperHeight = Math.max(laneHeight, wrapperSize.height);
        const needsResize =
            Number(wrapper.width) !== desiredWrapperWidth ||
            Number(wrapper.height) !== desiredWrapperHeight ||
            Number(wrapper.style?.width) !== desiredWrapperWidth ||
            Number(wrapper.style?.height) !== desiredWrapperHeight;
        const desiredInitialId = initialSkill?.id || null;
        const needsInitialUpdate =
            (wrapper.data?.initialChildId || null) !== desiredInitialId;
        const needsPresentationUpgrade =
            wrapper.className === "compound-in-lane" ||
            wrapper.draggable === false ||
            wrapper.selectable === false;

        if (
            !needsMerge &&
            !needsResize &&
            !needsInitialUpdate &&
            !needsPresentationUpgrade
        ) {
            return;
        }

        nextNodes = nextNodes
            .filter((node) => !extraWrapperIds.has(node.id))
            .map((node) => {
                if (node.id === wrapper.id) {
                    const { className: _legacyClassName, ...normalCompound } = node;

                    return {
                        ...normalCompound,
                        draggable: true,
                        selectable: true,
                        width: desiredWrapperWidth,
                        height: desiredWrapperHeight,
                        style: {
                            ...node.style,
                            width: desiredWrapperWidth,
                            height: desiredWrapperHeight,
                        },
                        data: {
                            ...node.data,
                            initialChildId: desiredInitialId,
                            autoParallelLaneCompound: true,
                        },
                    };
                }

                if (!allSkills.some((skill) => skill.id === node.id)) {
                    return node;
                }

                if (node.parentId === wrapper.id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            isInitial: node.id === desiredInitialId,
                        },
                    };
                }

                const oldParent = currentById.get(node.parentId);
                const oldParentPosition =
                    isAutoParallelLaneCompound(oldParent)
                        ? oldParent.position || { x: 0, y: 0 }
                        : { x: 0, y: 0 };

                const laneX =
                    Number(oldParentPosition.x || 0) +
                    Number(node.position?.x || 0);
                const laneY =
                    Number(oldParentPosition.y || 0) +
                    Number(node.position?.y || 0);

                return {
                    ...node,
                    parentId: wrapper.id,
                    extent: "parent",
                    expandParent: true,
                    position: {
                        x: laneX - Number(wrapperPosition.x || 0),
                        y: laneY - Number(wrapperPosition.y || 0),
                    },
                    data: {
                        ...node.data,
                        isInitial: node.id === desiredInitialId,
                    },
                };
            });

        changed = true;
    });

    return changed ? orderNodesParentsFirst(nextNodes) : allNodes;
};

const normalizeCompoundInitialStates = (allNodes) => {
    const compounds = (allNodes || []).filter(
        (node) => node.type === "compound"
    );

    if (compounds.length === 0) {
        return allNodes;
    }

    const desiredInitialByCompound = new Map();

    compounds.forEach((compound) => {
        const children = (allNodes || []).filter(
            (node) =>
                node.parentId === compound.id &&
                isCompoundInitialChildCandidate(node)
        );

        if (children.length === 0) {
            desiredInitialByCompound.set(compound.id, null);
            return;
        }

        const storedInitialId = compound.data?.initialChildId;
        const storedInitialStillExists = children.some(
            (child) => child.id === storedInitialId
        );
        const existingInitial = children.find(
            (child) => child.data?.isInitial
        );

        desiredInitialByCompound.set(
            compound.id,
            storedInitialStillExists
                ? storedInitialId
                : existingInitial?.id || children[0].id
        );
    });

    let changed = false;

    const normalized = (allNodes || []).map((node) => {
        if (node.type === "compound") {
            const desiredInitialId =
                desiredInitialByCompound.get(node.id) || null;
            const currentInitialId =
                node.data?.initialChildId || null;

            if (currentInitialId === desiredInitialId) {
                return node;
            }

            changed = true;
            return {
                ...node,
                data: {
                    ...node.data,
                    initialChildId: desiredInitialId,
                },
            };
        }

        if (
            node.parentId &&
            desiredInitialByCompound.has(node.parentId)
        ) {
            const desiredInitialId =
                desiredInitialByCompound.get(node.parentId);
            const shouldBeInitial =
                Boolean(desiredInitialId) &&
                node.id === desiredInitialId;
            const currentlyInitial =
                Boolean(node.data?.isInitial);

            if (currentlyInitial === shouldBeInitial) {
                return node;
            }

            changed = true;
            return {
                ...node,
                data: {
                    ...node.data,
                    isInitial: shouldBeInitial,
                },
            };
        }

        return node;
    });

    return changed ? normalized : allNodes;
};

// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();


const DEFAULT_BEHAVIOR_DIRECTORIES = [
    {
        key: "ROBOCUP",
        path: "/robocup_ws/robocup",
        isDefault: true,
    },
];

const loadBehaviorDirectories = () => {
    try {
        const raw = window.localStorage.getItem(
            "bonsai.behaviorDirectories"
        );

        if (!raw) {
            return DEFAULT_BEHAVIOR_DIRECTORIES;
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return DEFAULT_BEHAVIOR_DIRECTORIES;
        }

        return parsed
            .filter(
                (entry) =>
                    entry &&
                    typeof entry.key === "string" &&
                    typeof entry.path === "string"
            )
            .map((entry) => ({
                ...entry,
                key: entry.key.trim().toUpperCase(),
            }))
            // Remove only the old built-in defaults. If the user added an
            // EXERCISE or CHALLENGE mapping themselves, keep it.
            .filter(
                (entry) =>
                    !(
                        entry.isDefault === true &&
                        (entry.key === "EXERCISE" ||
                            entry.key === "CHALLENGE")
                    )
            );
    } catch (error) {
        console.warn(
            "Could not load behavior directories:",
            error
        );
        return DEFAULT_BEHAVIOR_DIRECTORIES;
    }
};



const getSkillPackageName = (fullSkillName) => {
    let baseName = String(fullSkillName || "").split("#")[0];

    const skillsMarker = ".skills.";
    const skillsIndex = baseName.indexOf(skillsMarker);

    if (skillsIndex !== -1) {
        baseName = baseName.slice(
            skillsIndex + skillsMarker.length
        );
    }

    const parts = baseName.split(".").filter(Boolean);

    if (parts.length <= 1) {
        return "";
    }

    return parts.slice(0, -1).join(".");
};

const getStoredTransitionAssignments = (...sources) => {
    for (const source of sources) {
        if (!source) continue;

        if (Array.isArray(source.assignments)) {
            return source.assignments
                .filter((assignment) => assignment?.location)
                .map((assignment) => ({
                    location: assignment.location,
                    expr: assignment.expr || "",
                }));
        }

        if (source.assign?.location) {
            return [
                {
                    location: source.assign.location,
                    expr: source.assign.expr || "",
                },
            ];
        }

        if (source.assignLocation) {
            return [
                {
                    location: source.assignLocation,
                    expr: source.assignExpr || "",
                },
            ];
        }
    }

    return [];
};

// The editor uses @variable as a visual/reference convention, while Bonsai
// SCXML assignment expressions use the datamodel identifier directly. Keep
// the editor state untouched and normalize only the data passed to the SCXML
// generator. Skill parameter expressions are intentionally NOT normalized.
const normalizeAssignmentExpressionForScxml = (value) => {
    let expression = String(value ?? "").trim();
    if (!expression) return "";

    // Keep a direct editor variable reference marked until scxmlExport serializes
    // it. The exporter knows that @foo is a reference and emits foo without
    // turning it into the string literal 'foo'.
    if (/^@[A-Za-z_#][A-Za-z0-9_:#.\-]*$/.test(expression)) {
        return expression;
    }

    // Older editor versions could accidentally persist a complete expression
    // as a quoted string. Unwrap that form when it is clearly an expression
    // containing a UI-style @variable reference and an operator. Genuine
    // string literals remain quoted.
    const first = expression[0];
    const last = expression[expression.length - 1];
    if (
        expression.length >= 2 &&
        (first === "\"" || first === "'") &&
        last === first
    ) {
        const inner = expression.slice(1, -1).trim();
        if (
            /@[A-Za-z_#]/.test(inner) &&
            /(?:==|!=|>=|<=|&&|\|\||[+\-*/%<>])/.test(inner)
        ) {
            expression = inner;
        }
    }

    // Only transform unquoted portions so literal strings such as
    // "contact@example.org" or "@literal" are not modified.
    let result = "";
    let unquoted = "";
    let quote = null;
    let escaped = false;

    const flushUnquoted = () => {
        if (!unquoted) return;

        result += unquoted
            // @test_value -> test_value
            .replace(/@(?=[A-Za-z_#])/g, "")
            // Normalize operator spacing for readable generated SCXML.
            .replace(
                /\s*(==|!=|>=|<=|&&|\|\||[+\-*/%<>])\s*/g,
                " $1 "
            )
            .replace(/\s+/g, " ");

        unquoted = "";
    };

    for (const character of expression) {
        if (quote) {
            result += character;

            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (character === "\"" || character === "'") {
            flushUnquoted();
            quote = character;
            result += character;
            continue;
        }

        unquoted += character;
    }

    flushUnquoted();
    return result.trim();
};

const normalizeAssignmentForScxml = (assignment) =>
    assignment
        ? {
            ...assignment,
            expr: normalizeAssignmentExpressionForScxml(assignment.expr),
        }
        : assignment;

const getForwardingNopScxmlStateId = (node, eventName) => {
    const fullSkillName = String(node?.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0] || "Nop";
    const normalizedEvent = String(eventName || "").trim();

    if (!normalizedEvent) {
        return String(
            node?.data?.scxmlStateId ||
            node?.data?.behaviorExitScxmlStateId ||
            fullSkillName ||
            skillBase
        ).trim();
    }

    // Keep the SCXML state readable and deterministic while avoiding the
    // editor-only clone/instance id. Nops forwarding the same event therefore
    // share one state, while different events get distinct states.
    const eventSuffix = normalizedEvent
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "send";

    return `${skillBase}#${eventSuffix}`;
};

const getBehaviorExitSignature = (node) => {
    if (!node?.data?.isBehaviorExit) return "";

    const transitions =
        Array.isArray(node.data?.behaviorExitTransitions) &&
        node.data.behaviorExitTransitions.length > 0
            ? node.data.behaviorExitTransitions
            : [
                {
                    triggerEvent: "Nop.fatal",
                    sendEvents: node.data?.behaviorExitEvents || [],
                },
            ];

    return transitions
        .map((transition) => {
            const trigger = String(transition?.triggerEvent || "Nop.fatal").trim();
            const sendEvents = Array.isArray(transition?.sendEvents)
                ? transition.sendEvents.map((eventName) => String(eventName || "").trim()).filter(Boolean)
                : [];

            return `${trigger}|${sendEvents.sort().join(",")}`;
        })
        .sort()
        .join("||");
};

const getSharedScxmlStateId = (node) => {
    if (node?.type !== "custom") return "";

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    if (!fullSkillName) return "";

    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";

    if (skillName === "end" || skillName === "fatal") {
        return String(node.data?.scxmlStateId || skillBase).trim();
    }

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        const sentEvent = Array.isArray(node.data?.behaviorExitEvents)
            ? node.data.behaviorExitEvents.find((eventName) =>
                String(eventName || "").trim()
            )
            : "";

        return getForwardingNopScxmlStateId(node, sentEvent);
    }

    return "";
};

const getSharedScxmlStateKey = (node) => {
    const scxmlStateId = getSharedScxmlStateId(node);
    if (!scxmlStateId) return null;

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";

    if (skillName === "end" || skillName === "fatal") {
        return `${skillName}|${scxmlStateId}`;
    }

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        return `nop-exit|${skillBase}|${getBehaviorExitSignature(node)}`;
    }

    return null;
};

const normalizeSharedScxmlStateIdentity = (node) => {
    const sharedKey = getSharedScxmlStateKey(node);
    if (!sharedKey) return node;

    const fullSkillName = String(node.data?.fullSkillName || "").trim();
    const skillBase = fullSkillName.split("#")[0];
    const skillName = skillBase.split(".").pop()?.toLowerCase() || "";
    const scxmlStateId = getSharedScxmlStateId(node) || skillBase;

    if (skillName === "nop" && node.data?.isBehaviorExit) {
        const sentEvents = Array.isArray(node.data?.behaviorExitEvents)
            ? node.data.behaviorExitEvents.filter(Boolean)
            : [];

        return {
            ...node,
            data: {
                ...(node.data || {}),
                label:
                    sentEvents.length > 0
                        ? sentEvents.join(", ")
                        : node.data?.label || "Nop",
                behaviorExitScxmlStateId: scxmlStateId,
                scxmlStateId,
                // fullSkillName remains the editor-facing skill identity. The
                // shared SCXML identity is kept separately in scxmlStateId.
                fullSkillName: fullSkillName || skillBase,
            },
        };
    }

    return {
        ...node,
        data: {
            ...(node.data || {}),
            label: skillName === "end" ? "End" : "Fatal",
            scxmlStateId,
            fullSkillName: fullSkillName || skillBase,
            isFinal: true,
        },
    };
};

const ensureSharedEditorInstanceIds = (sourceNodes = []) => {
    const usedByKey = new Map();

    sourceNodes.forEach((rawNode) => {
        const node = normalizeSharedScxmlStateIdentity(rawNode);
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return;

        const existing = String(node.data?.editorInstanceId || "").trim();
        if (!existing) return;

        if (!usedByKey.has(sharedKey)) usedByKey.set(sharedKey, new Set());
        usedByKey.get(sharedKey).add(existing);
    });

    return sourceNodes.map((rawNode) => {
        const node = normalizeSharedScxmlStateIdentity(rawNode);
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return node;

        if (!usedByKey.has(sharedKey)) usedByKey.set(sharedKey, new Set());
        const used = usedByKey.get(sharedKey);
        const existing = String(node.data?.editorInstanceId || "").trim();

        if (existing) return node;

        let index = 1;
        while (used.has(String(index))) index += 1;
        const editorInstanceId = String(index);
        used.add(editorInstanceId);

        return {
            ...node,
            data: {
                ...(node.data || {}),
                editorInstanceId,
            },
        };
    });
};

const getExportFullSkillName = (node) => {
    const sharedScxmlStateId = getSharedScxmlStateId(node);
    if (sharedScxmlStateId) return sharedScxmlStateId;
    return String(node.data?.fullSkillName || "").trim();
};

const prepareGraphForScxml = (sourceNodes = [], sourceEdges = []) => {
    // End, Fatal, and identical forwarding-Nop exits may appear multiple times
    // visually while representing one SCXML state. Their editor node IDs and
    // editorInstanceIds stay distinct, while export keeps one canonical state.
    const normalizedNodes = ensureSharedEditorInstanceIds(
        (sourceNodes || []).map(normalizeSharedScxmlStateIdentity)
    );

    const sharedGroups = new Map();
    normalizedNodes.forEach((node) => {
        const sharedKey = getSharedScxmlStateKey(node);
        if (!sharedKey) return;
        if (!sharedGroups.has(sharedKey)) sharedGroups.set(sharedKey, []);
        sharedGroups.get(sharedKey).push(node);
    });

    const aliasToCanonicalId = new Map();
    const clonePositionsByCanonicalId = new Map();

    sharedGroups.forEach((group) => {
        const canonical = group.find((node) => !node.parentId) || group[0];
        group.forEach((node) => aliasToCanonicalId.set(node.id, canonical.id));

        clonePositionsByCanonicalId.set(
            canonical.id,
            group.map((node, index) => {
                const absolutePosition = getAbsoluteNodePosition(
                    node,
                    normalizedNodes
                );

                return {
                    instanceId:
                        String(node.data?.editorInstanceId || "").trim() ||
                        String(index + 1),
                    x: Number(absolutePosition.x || 0),
                    y: Number(absolutePosition.y || 0),
                };
            })
        );
    });

    const remapNodeId = (nodeId) => aliasToCanonicalId.get(nodeId) || nodeId;
    const seenSharedStates = new Set();

    const exportNodes = normalizedNodes
        .filter((node) => {
            const sharedKey = getSharedScxmlStateKey(node);
            if (!sharedKey) return true;

            const canonicalId = aliasToCanonicalId.get(node.id);
            if (node.id !== canonicalId || seenSharedStates.has(sharedKey)) {
                return false;
            }

            seenSharedStates.add(sharedKey);
            return true;
        })
        .map((node) => ({
            ...node,
            data: {
                ...(node.data || {}),
                fullSkillName: getExportFullSkillName(node),
                editorClonePositions:
                    clonePositionsByCanonicalId.get(node.id) || undefined,
                onEntry: Array.isArray(node.data?.onEntry)
                    ? node.data.onEntry.map(normalizeAssignmentForScxml)
                    : node.data?.onEntry,
                onExit: Array.isArray(node.data?.onExit)
                    ? node.data.onExit.map(normalizeAssignmentForScxml)
                    : node.data?.onExit,
                events: Array.isArray(node.data?.events)
                    ? node.data.events.map((event) => ({
                        ...event,
                        target: event.target ? remapNodeId(event.target) : event.target,
                        assignments: Array.isArray(event.assignments)
                            ? event.assignments.map(normalizeAssignmentForScxml)
                            : event.assignments,
                        assignExpr: event.assignExpr !== undefined
                            ? normalizeAssignmentExpressionForScxml(event.assignExpr)
                            : event.assignExpr,
                    }))
                    : node.data?.events,
            },
        }));

    const seenExportEdges = new Set();
    const exportEdges = (sourceEdges || [])
        .map((edge) => ({
            ...edge,
            source: remapNodeId(edge.source),
            target: remapNodeId(edge.target),
            data: {
                ...(edge.data || {}),
                assignments: Array.isArray(edge.data?.assignments)
                    ? edge.data.assignments.map(normalizeAssignmentForScxml)
                    : edge.data?.assignments,
                assign: edge.data?.assign
                    ? normalizeAssignmentForScxml(edge.data.assign)
                    : edge.data?.assign,
                assignExpr: edge.data?.assignExpr !== undefined
                    ? normalizeAssignmentExpressionForScxml(edge.data.assignExpr)
                    : edge.data?.assignExpr,
            },
        }))
        .filter((edge) => {
            // Multiple editor aliases of one shared state collapse to one SCXML
            // target. Avoid emitting duplicate transitions after remapping.
            const transitionKey = JSON.stringify({
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle || edge.label || "",
                cond: edge.data?.cond || "",
                assignments: edge.data?.assignments || edge.data?.assign || [],
            });

            if (seenExportEdges.has(transitionKey)) return false;
            seenExportEdges.add(transitionKey);
            return true;
        });

    return { nodes: exportNodes, edges: exportEdges };
};

const getLocalDataModelEntries = (dataModel = []) =>
    (dataModel || []).filter((parameter) => {
        const id = String(parameter?.id || "").trim();

        if (!id || id === "#_STATE_PREFIX" || id === "#_SLOTS") return false;

        // IDs beginning with "_" are inherited/global variables in the
        // Bonsai editor. Everything else belongs to this state machine's
        // local datamodel.
        return !id.startsWith("_");
    });

const collectDescendantGlobals = (
    tabList,
    rootTabId,
    blockedGlobalIds = []
) => {
    const childrenByParent = new Map();

    (tabList || []).forEach((tab) => {
        if (!tab.parentTabId) return;

        if (!childrenByParent.has(tab.parentTabId)) {
            childrenByParent.set(tab.parentTabId, []);
        }

        childrenByParent.get(tab.parentTabId).push(tab);
    });

    const result = [];

    const visit = (parentTabId, blockedIds) => {
        const children = childrenByParent.get(parentTabId) || [];

        children.forEach((child) => {
            const childGlobals = (child.globalDataModel || []).filter(
                (parameter) =>
                    String(parameter.id || "").startsWith("_")
            );

            childGlobals.forEach((parameter) => {
                if (blockedIds.has(parameter.id)) {
                    return;
                }

                result.push({
                    ...parameter,
                    definedIn:
                        child.title ||
                        child.fileName ||
                        "Sub-state machine",
                    sourceTabId: child.id,
                });
            });

            const blockedForChildren = new Set(blockedIds);

            childGlobals.forEach((parameter) => {
                blockedForChildren.add(parameter.id);
            });

            visit(child.id, blockedForChildren);
        });
    };

    visit(rootTabId, new Set(blockedGlobalIds));

    return result;
};

const cloneGraphValue = (value) => {
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

    // Keep functions and primitives as-is. Node data contains callbacks that
    // must remain callable after an internal copy/paste.
    return value;
};

// Undo/redo stores only persistent editor state. React Flow selection, drag,
// and measured-layout fields are transient UI state and must not create
// history entries of their own.
const sanitizeNodeForHistory = (node) => {
    const copy = cloneGraphValue(node);
    delete copy.selected;
    delete copy.dragging;
    delete copy.measured;
    return copy;
};

const sanitizeEdgeForHistory = (edge) => {
    const copy = cloneGraphValue(edge);
    delete copy.selected;
    return copy;
};

const isUndoRedoEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
        target.closest(
            'input, textarea, select, [contenteditable="true"], [role="textbox"], .monaco-editor, .cm-editor'
        )
    );
};

function AppContent() {
    const [skills, setSkills] = useState({ skills: [] });
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [selectedSubPackage, setSelectedSubPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Everything");
    const [searchText, setSearchText] = useState("");
    const [contextMenu, setContextMenu] = useState(null);
    const [parallelDropTargetId, setParallelDropTargetId] = useState(null);
    const [compoundDropTargetId, setCompoundDropTargetId] = useState(null);
    const updateNodeInternals = useUpdateNodeInternals();
    const [leftLibraryTab, setLeftLibraryTab] = useState("skills");
    const [behaviorDirectories, setBehaviorDirectories] = useState(
        loadBehaviorDirectories
    );

    useEffect(() => {
        window.localStorage.setItem(
            "bonsai.behaviorDirectories",
            JSON.stringify(behaviorDirectories)
        );
    }, [behaviorDirectories]);

    //---- TAB MANAGEMENT ----
    const [tabs, setTabs] = useState([
        {
            id: "tab-1",
            title: "Workflow 1",
            fileName: "Workflow_1.xml",
            fileHandle: null,
            filePath: null,
            nodes: [],
            edges: [],
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: null,
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        },
    ]);
    const [activeTabId, setActiveTabId] = useState("tab-1");
    const [tabPathTooltip, setTabPathTooltip] = useState(null);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [slotNodes, setSlotNodes, onSlotNodesChange] = useNodesState([]);
    const [slotEdges, setSlotEdges, onSlotEdgesChange] = useEdgesState([]);

    useEffect(() => {
        setNodes((currentNodes) => {
            // Keep structural normalization here, but do not run the grow-all
            // pass from a nodes-dependent effect. The grow helpers intentionally
            // create updated node objects when fitting containers; doing that
            // here caused an endless nodes -> effect -> nodes loop as soon as a
            // parallel/compound existed (visible as a black screen).
            //
            // Automatic growth is still handled by expandParent during live
            // dragging and by the explicit fit/grow calls in the drop/reparent
            // paths below.
            const withAutoExpansion =
                normalizeContainerAutoExpansion(currentNodes);
            const withParallelLaneCompounds =
                normalizeParallelLaneCompounds(withAutoExpansion);

            return normalizeCompoundInitialStates(
                withParallelLaneCompounds
            );
        });
    }, [nodes, setNodes]);

    // Internal graph clipboard. This intentionally does not use the system
    // clipboard: Ctrl+C copies the current React Flow selection and
    // Ctrl+V recreates it with fresh graph IDs.
    const graphClipboardRef = useRef(null);
    const pasteSequenceRef = useRef(0);

    // Editor-wide Find (Ctrl+F): searches skill/behavior nodes and slot paths
    // in the currently active workflow.
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findResultIndex, setFindResultIndex] = useState(0);
    const findInputRef = useRef(null);
    const findPanelRef = useRef(null);
    const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

    const [activeMode, setActiveMode] = useState("event");
    const [slotConnectionDrag, setSlotConnectionDrag] = useState(null);
    const [manualSlots, setManualSlots] = useState([]);
    const [isCreateSlotModalOpen, setIsCreateSlotModalOpen] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    // Hover coming from Slot Details is intentionally separate from hovering
    // a node directly on the canvas. The former previews only that one
    // skill-to-slot connection; canvas hover mirrors normal node highlighting.
    const [hoveredSlotAccessNodeId, setHoveredSlotAccessNodeId] = useState(null);
    const [hoveredEditorNodeId, setHoveredEditorNodeId] = useState(null);
    const [hoveredEditorEdgeId, setHoveredEditorEdgeId] = useState(null);
    // Drag focus is deliberately separate from pointer hover. During a drag the
    // cursor can temporarily outrun the rendered node, which fires mouse-leave
    // events. Keep the dragged node as the authoritative canvas focus until the
    // drag ends so highlighting never flickers.
    const [draggedEditorNodeId, setDraggedEditorNodeId] = useState(null);

    // Slot creation belongs to the slot-centric views only. If the user switches
    // to Event or Code mode while the dialog is open, close it immediately.
    useEffect(() => {
        if (activeMode !== "slots" && activeMode !== "overview") {
            setIsCreateSlotModalOpen(false);
        }
    }, [activeMode]);
    const [activeTab, setActiveTab] = useState("allgemein");
    const [rightPanelTab, setRightPanelTab] = useState("datamodel");
    const [parameterFocusRequest, setParameterFocusRequest] = useState(null);
    const parameterFocusRequestIdRef = useRef(0);
    const [slotFocusRequest, setSlotFocusRequest] = useState(null);
    const slotFocusRequestIdRef = useRef(0);
    const [transitionFocusRequest, setTransitionFocusRequest] = useState(null);
    const transitionFocusRequestIdRef = useRef(0);

    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isOverTrash, setIsOverTrash] = useState(false);

    const [globalDataModel, setGlobalDataModel] = useState([
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
        { id: "Test: globales Datamodel", expr: "testen" },
    ]);
    const [inheritedGlobalDataModel, setInheritedGlobalDataModel] = useState([]);
    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");

    // Undo/redo history is local to the currently active workflow tab.
    // Selection is intentionally excluded from snapshots.
    const historyRef = useRef([]);
    const historyIndexRef = useRef(-1);
    const historyTimerRef = useRef(null);
    const historyTabRef = useRef(activeTabId);
    const applyingHistoryRef = useRef(false);
    const currentHistorySnapshotRef = useRef(null);

    const descendantGlobalDataModel = useMemo(() => {
        const blockedIds = [
            ...(inheritedGlobalDataModel || []),
            ...(globalDataModel || []),
        ]
            .filter((parameter) =>
                String(parameter.id || "").startsWith("_")
            )
            .map((parameter) => parameter.id);

        return collectDescendantGlobals(
            tabs,
            activeTabId,
            blockedIds
        );
    }, [
        tabs,
        activeTabId,
        globalDataModel,
        inheritedGlobalDataModel,
    ]);


    const availableDataModelParameters = useMemo(() => {
        const parameters = [];
        const seen = new Set();

        // Parent globals take precedence when a child defines the same global.
        [...(inheritedGlobalDataModel || []), ...(globalDataModel || [])].forEach(
            (parameter) => {
                if (!parameter?.id || seen.has(parameter.id)) return;
                seen.add(parameter.id);
                parameters.push(parameter);
            }
        );
        return parameters;
    }, [inheritedGlobalDataModel, globalDataModel]);

    const createHistorySnapshot = useCallback(() => ({
        nodes: nodes.map(sanitizeNodeForHistory),
        edges: edges.map(sanitizeEdgeForHistory),
        slotNodes: slotNodes.map(sanitizeNodeForHistory),
        slotEdges: slotEdges.map(sanitizeEdgeForHistory),
        manualSlots: cloneGraphValue(manualSlots),
        globalDataModel: cloneGraphValue(globalDataModel),
    }), [
        nodes,
        edges,
        slotNodes,
        slotEdges,
        manualSlots,
        globalDataModel,
    ]);

    const getHistoryHash = useCallback(
        (snapshot) => JSON.stringify(snapshot),
        []
    );

    const commitHistorySnapshot = useCallback((snapshot) => {
        if (!snapshot) return false;

        const hash = getHistoryHash(snapshot);
        const currentEntry = historyRef.current[historyIndexRef.current];
        if (currentEntry?.hash === hash) return false;

        // A new edit after Undo discards the old Redo branch.
        const nextHistory = historyRef.current.slice(
            0,
            historyIndexRef.current + 1
        );

        nextHistory.push({
            hash,
            snapshot: cloneGraphValue(snapshot),
        });

        // Bound memory usage while still keeping a useful editing history.
        if (nextHistory.length > 100) {
            nextHistory.splice(0, nextHistory.length - 100);
        }

        historyRef.current = nextHistory;
        historyIndexRef.current = nextHistory.length - 1;
        return true;
    }, [getHistoryHash]);

    useEffect(() => {
        const snapshot = createHistorySnapshot();
        currentHistorySnapshotRef.current = snapshot;

        // Never let Ctrl+Z cross workflow-tab boundaries. Each tab starts its
        // own undo stack from the state visible when it becomes active.
        if (historyTabRef.current !== activeTabId) {
            historyTabRef.current = activeTabId;
            historyRef.current = [];
            historyIndexRef.current = -1;
            applyingHistoryRef.current = false;

            if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
                historyTimerRef.current = null;
            }

            commitHistorySnapshot(snapshot);
            return;
        }

        // Applying Undo/Redo itself must not immediately become a new edit.
        if (applyingHistoryRef.current) {
            applyingHistoryRef.current = false;
            return;
        }

        if (historyRef.current.length === 0) {
            commitHistorySnapshot(snapshot);
            return;
        }

        // Debounce state changes so a node drag/control-point drag is one undo
        // step instead of dozens of intermediate positions.
        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
        }

        historyTimerRef.current = setTimeout(() => {
            historyTimerRef.current = null;
            commitHistorySnapshot(currentHistorySnapshotRef.current);
        }, 180);

        return () => {
            if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
                historyTimerRef.current = null;
            }
        };
    }, [
        activeTabId,
        createHistorySnapshot,
        commitHistorySnapshot,
    ]);

    const applyHistorySnapshot = useCallback((snapshot) => {
        if (!snapshot) return;

        if (historyTimerRef.current) {
            clearTimeout(historyTimerRef.current);
            historyTimerRef.current = null;
        }

        applyingHistoryRef.current = true;

        const restoredNodes = normalizeCompoundInitialStates(
            growAllStateContainersToContents(
                normalizeParallelLaneCompounds(
                    normalizeContainerAutoExpansion(
                        cloneGraphValue(snapshot.nodes || []).map((node) => ({
                            ...node,
                            selected: false,
                        }))
                    )
                )
            )
        );

        setNodes(restoredNodes);
        setEdges(
            cloneGraphValue(snapshot.edges || []).map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
        setSlotNodes(
            cloneGraphValue(snapshot.slotNodes || []).map((node) => ({
                ...node,
                selected: false,
            }))
        );
        setSlotEdges(
            cloneGraphValue(snapshot.slotEdges || []).map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
        setManualSlots(cloneGraphValue(snapshot.manualSlots || []));
        setGlobalDataModel(cloneGraphValue(snapshot.globalDataModel || []));
        setSelectedNodeId(null);
        setRightPanelTab("datamodel");

        requestAnimationFrame(() => {
            restoredNodes.forEach((node) => updateNodeInternals(node.id));
        });
    }, [
        setNodes,
        setEdges,
        setSlotNodes,
        setSlotEdges,
        updateNodeInternals,
    ]);

    const undo = useCallback(() => {
        // Capture the newest edit even if Ctrl+Z is pressed before the 180 ms
        // debounce has committed it.
        commitHistorySnapshot(currentHistorySnapshotRef.current);

        if (historyIndexRef.current <= 0) return false;

        historyIndexRef.current -= 1;
        applyHistorySnapshot(
            historyRef.current[historyIndexRef.current]?.snapshot
        );
        return true;
    }, [applyHistorySnapshot, commitHistorySnapshot]);

    const redo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) {
            return false;
        }

        historyIndexRef.current += 1;
        applyHistorySnapshot(
            historyRef.current[historyIndexRef.current]?.snapshot
        );
        return true;
    }, [applyHistorySnapshot]);

    useEffect(() => {
        const handleUndoRedoShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (activeMode === "code") return;
            if (isUndoRedoEditableTarget(event.target)) return;

            const key = String(event.key || "").toLowerCase();
            let handled = false;

            if (key === "z") {
                handled = event.shiftKey ? redo() : undo();
            } else if (key === "y" && !event.shiftKey) {
                handled = redo();
            }

            if (!handled) return;

            event.preventDefault();
            event.stopPropagation();
        };

        // Capture phase prevents the browser/React Flow from consuming the
        // shortcut first, while text/code editors still retain native undo.
        window.addEventListener("keydown", handleUndoRedoShortcut, true);
        return () =>
            window.removeEventListener(
                "keydown",
                handleUndoRedoShortcut,
                true
            );
    }, [activeMode, undo, redo]);

    // Transition Drawer State
    const [drawerData, setDrawerData] = useState({
        isOpen: false,
        sourceNodeId: null,
        sourceNodeName: "",
        sourceEventName: "",
        initialTargetId: null,
        initialTransitionId: null,
        candidateTransitions: [],
        availableEvents: [],
        availableTargets: [],
    });

    useEffect(() => {
        if (!selectedNodeId) {
            setRightPanelTab("datamodel");
        }
    }, [selectedNodeId]);

    const { screenToFlowPosition, fitView, getNodes } = useReactFlow();

    const buildInheritedGlobalsForChild = (
        inheritedGlobals,
        parentDataModel,
        parentName
    ) => {
        const inherited = [];
        const seen = new Set();

        (inheritedGlobals || []).forEach((parameter) => {
            if (!String(parameter.id || "").startsWith("_")) return;
            if (seen.has(parameter.id)) return;

            seen.add(parameter.id);
            inherited.push(parameter);
        });

        (parentDataModel || []).forEach((parameter) => {
            if (!String(parameter.id || "").startsWith("_")) return;
            if (seen.has(parameter.id)) return;

            seen.add(parameter.id);
            inherited.push({
                ...parameter,
                inheritedFrom: parentName || "Parent",
            });
        });

        return inherited;
    };

    // Aktuellen Tab synchronisieren beim Tabwechsel
    const switchTab = (targetTabId) => {
        if (targetTabId === activeTabId) return;

        const updatedTabs = tabs.map((t) =>
            t.id === activeTabId
                ? {
                    ...t,
                    nodes,
                    edges,
                    slotNodes,
                    slotEdges,
                    manualSlots,
                    globalDataModel,
                    inheritedGlobalDataModel,
                }
                : t
        );

        const targetTab = updatedTabs.find(
            (t) => t.id === targetTabId
        );

        if (targetTab) {
            setTabs(updatedTabs);
            setActiveTabId(targetTabId);
            setNodes(targetTab.nodes || []);
            setEdges(targetTab.edges || []);
            setSlotNodes(targetTab.slotNodes || []);
            setSlotEdges(targetTab.slotEdges || []);
            setManualSlots(targetTab.manualSlots || []);
            setGlobalDataModel(targetTab.globalDataModel || []);
            setInheritedGlobalDataModel(
                targetTab.inheritedGlobalDataModel || []
            );
            setSelectedNodeId(null);
            setTimeout(
                () => fitView({ padding: 0.2, duration: 250 }),
                50
            );
        }
    };

    // IDE-style workflow navigation/search shortcuts. Ctrl+Tab cycles
    // workflow tabs; Shift reverses direction. Ctrl+F opens the editor
    // search instead of the browser's page search.
    useEffect(() => {
        const handleEditorShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

            const key = String(event.key || "").toLowerCase();

            const isTabShortcut =
                key === "tab" ||
                event.code === "Tab" ||
                event.keyCode === 9;

            if (isTabShortcut) {
                if (tabs.length <= 1) return;

                // Handle this in the capture phase so React Flow / focused UI
                // controls cannot consume Shift+Tab before workflow navigation.
                event.preventDefault();
                event.stopPropagation();

                const currentIndex = Math.max(
                    0,
                    tabs.findIndex((tab) => tab.id === activeTabId)
                );
                const direction = event.shiftKey ? -1 : 1;
                const nextIndex =
                    (currentIndex + direction + tabs.length) % tabs.length;

                switchTab(tabs[nextIndex].id);
                return;
            }

            if (key === "f") {
                const target = event.target;
                const insideCodeEditor =
                    target instanceof Element &&
                    Boolean(target.closest(".monaco-editor, .cm-editor"));

                // Preserve the native editor search when the user is actively
                // editing code. Everywhere else Ctrl+F searches the graph.
                if (insideCodeEditor) return;

                event.preventDefault();
                setIsFindOpen(true);
            }
        };

        // Capture-phase listener is important for Ctrl+Shift+Tab: focused
        // components often use Shift+Tab for their own backwards focus order.
        window.addEventListener("keydown", handleEditorShortcut, true);
        return () =>
            window.removeEventListener("keydown", handleEditorShortcut, true);
    }, [tabs, activeTabId, switchTab]);

    useEffect(() => {
        if (!isFindOpen) return;

        requestAnimationFrame(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
        });
    }, [isFindOpen]);

    // Dismiss the editor search as soon as the user clicks anywhere outside
    // the search panel. Capture phase makes this work reliably even when the
    // click lands on React Flow or another component that stops propagation.
    useEffect(() => {
        if (!isFindOpen) return;

        const handlePointerDownOutsideFind = (event) => {
            const panel = findPanelRef.current;
            if (panel && !panel.contains(event.target)) {
                setIsFindOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDownOutsideFind, true);
        return () =>
            document.removeEventListener(
                "pointerdown",
                handlePointerDownOutsideFind,
                true
            );
    }, [isFindOpen]);

    const handleAddNewTab = () => {
        const updatedCurrent = tabs.map((t) =>
            t.id === activeTabId
                ? {
                    ...t,
                    nodes,
                    edges,
                    slotNodes,
                    slotEdges,
                    manualSlots,
                    globalDataModel,
                    inheritedGlobalDataModel,
                }
                : t
        );

        const newId = `tab-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newId,
            title: `Workflow ${tabs.length + 1}`,
            fileName: `Workflow_${tabs.length + 1}.xml`,
            fileHandle: null,
            nodes: [],
            edges: [],
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: null,
            inheritedGlobalDataModel: [],
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        };

        setTabs([...updatedCurrent, newTabObj]);
        setActiveTabId(newId);
        setNodes([]);
        setEdges([]);
        setSlotNodes([]);
        setSlotEdges([]);
        setManualSlots([]);
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel([]);
        setSelectedNodeId(null);
    };

    const handleCloseTab = (tabIdToClose, e = null) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (tabs.length === 1) return;

        const remainingTabs = tabs.filter((t) => t.id !== tabIdToClose);
        setTabs(remainingTabs);

        if (activeTabId === tabIdToClose) {
            const fallbackTab = remainingTabs[remainingTabs.length - 1];
            setActiveTabId(fallbackTab.id);
            setNodes(fallbackTab.nodes || []);
            setEdges(fallbackTab.edges || []);
            setSlotNodes(fallbackTab.slotNodes || []);
            setSlotEdges(fallbackTab.slotEdges || []);
            setManualSlots(fallbackTab.manualSlots || []);
            setGlobalDataModel(fallbackTab.globalDataModel || []);
            setInheritedGlobalDataModel(
                fallbackTab.inheritedGlobalDataModel || []
            );
            setSelectedNodeId(null);
        }
    };

    const [draggedTabId, setDraggedTabId] = useState(null);

    const handleTabDragStart = (event, tabId) => {
        setDraggedTabId(tabId);

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tabId);
        }
    };

    const handleTabDragOver = (event, targetTabId) => {
        event.preventDefault();

        if (!draggedTabId || draggedTabId === targetTabId) {
            return;
        }

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        setTabs((currentTabs) => {
            const sourceIndex = currentTabs.findIndex(
                (tab) => tab.id === draggedTabId
            );
            const targetIndex = currentTabs.findIndex(
                (tab) => tab.id === targetTabId
            );

            if (
                sourceIndex < 0 ||
                targetIndex < 0 ||
                sourceIndex === targetIndex
            ) {
                return currentTabs;
            }

            const reorderedTabs = [...currentTabs];
            const [movedTab] = reorderedTabs.splice(sourceIndex, 1);
            reorderedTabs.splice(targetIndex, 0, movedTab);
            return reorderedTabs;
        });
    };

    const handleTabDragEnd = () => {
        setDraggedTabId(null);
    };

    const handleTabMiddleMouseDown = (event, tabId) => {
        if (event.button !== 1) return;

        event.preventDefault();
        event.stopPropagation();
        handleCloseTab(tabId, event);
    };

    const handleContextMenuOpen = useCallback((event, clickedNode = null) => {
        event.preventDefault();
        event.stopPropagation();

        if (clickedNode && !clickedNode.selected) {
            setNodes((nds) =>
                nds.map((n) => ({
                    ...n,
                    selected: n.id === clickedNode.id,
                }))
            );
            setSelectedNodeId(clickedNode.id);
        }

        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            flowPosition: flowPos,
        });
    }, [screenToFlowPosition, setNodes]);

    const handleSelectAction = (type) => {
        const hasSelection = selectedNodes.length > 0;

        if (type === "compound") {
            if (hasSelection) {
                handleCreateCompoundFromSelected();
            } else {
                handleCreateEmptyCompound(contextMenu.flowPosition);
            }
        } else if (type === "parallel") {
            if (hasSelection) {
                handleCreateParallelFromSelected();
            } else {
                handleCreateEmptyParallel(contextMenu.flowPosition);
            }
        } else if (type === "submachine") {
            if (hasSelection) {
                handleCreateSubMachineFromSelected();
            } else {
                handleCreateEmptySubMachine(contextMenu.flowPosition);
            }
        } else if (type === "slot") {
            if (activeMode === "slots" || activeMode === "overview") {
                setIsCreateSlotModalOpen(true);
            }
        }

        setContextMenu(null);
    };

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) setContextMenu(null);
        };
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [contextMenu]);

    const handleCreateEmptyCompound = (pos) => {
        const compoundId = getNodeId();
        const compoundName = `compound_${nodes.filter((n) => n.type === "compound").length + 1}`;

        const newNode = {
            id: compoundId,
            type: "compound",
            position: pos,
            style: { width: 320, height: 220 },
            data: {
                label: compoundName,
                fullSkillName: compoundName,
                isInitial: nodes.length === 0,
                events: [],
            },
        };

        setNodes((nds) =>
            resolveNodeCollisionsAndRefit(
                [...nds, newNode],
                compoundId
            )
        );
        setSelectedNodeId(compoundId); // <-- Details-Panel direkt öffnen
        setActiveTab("allgemein");
        setContextMenu(null);
    };

    const handleAddLaneToParallel = useCallback((parallelId) => {
        setNodes((nds) => {
            const parallelNode = nds.find((n) => n.id === parallelId);
            if (!parallelNode) return nds;

            const existingLanes = nds
                .filter(
                    (n) =>
                        n.parentId === parallelId &&
                        n.type === "parallelLane"
                )
                .sort((a, b) => a.position.y - b.position.y);

            const laneIndex = existingLanes.length;
            const laneHeight = 140;
            const headerHeight = 45;
            const buttonReserve = 35;

            const newLaneId = getNodeId();
            const newLaneName = `Lane_${laneIndex + 1}`;
            const containerWidth =
                Number(parallelNode.style?.width) || 420;

            // Ende der bisher letzten Lane bestimmen
            const lastLane = existingLanes[existingLanes.length - 1];

            const newLaneY = lastLane
                ? Number(lastLane.position?.y || 0) +
                Number(lastLane.style?.height || 140)
                : headerHeight;

            const newLaneNode = {
                id: newLaneId,
                position: {
                    x: 0,
                    y: newLaneY,
                },
                parentId: parallelId,
                extent: "parent",
                expandParent: true,
                type: "parallelLane",
                draggable: false,
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom: "none",
                },
                data: {
                    label: newLaneName,
                    events: [],
                },
            };

            const newTotalHeight =
                newLaneY + laneHeight + buttonReserve;

            const updatedNodes = nds.map((n) => {
                if (n.id === parallelId) {
                    return {
                        ...n,
                        style: {
                            ...n.style,
                            height: newTotalHeight,
                        },
                        data: {
                            ...n.data,
                            lanes: [
                                ...(n.data.lanes || []),
                                newLaneName,
                            ],
                        },
                    };
                }

                // Die bisher letzte Lane bekommt jetzt die Trennlinie,
                // weil danach die neue Lane kommt.
                if (lastLane && n.id === lastLane.id) {
                    return {
                        ...n,
                        style: {
                            ...n.style,
                            borderBottom:
                                "1.5px solid #0284c7",
                        },
                    };
                }

                return n;
            });

            return [...updatedNodes, newLaneNode];
        });
    }, [setNodes]);

    const handleCreateEmptyParallel = (pos) => {
        const parallelId = getNodeId();
        const parallelName = `parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;
        const laneHeight = 110;
        const headerHeight = 40;
        const containerWidth = 420;
        const containerHeight = headerHeight + 2 * laneHeight + 35;

        const parallelNode = {
            id: parallelId,
            type: "parallel",
            position: pos,
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: parallelName,
                fullSkillName: parallelName,
                isInitial: nodes.length === 0,
                lanes: ["Lane_1", "Lane_2"],
                events: [],
                onAddLane: handleAddLaneToParallel,
            },
        };

        const lane1 = {
            id: getNodeId(),
            position: { x: 0, y: headerHeight },
            parentId: parallelId,
            extent: "parent",
            expandParent: true,
            type: "parallelLane",
            draggable: false,
            style: { width: containerWidth, height: laneHeight, borderBottom: "1.5px solid #0284c7" },
            data: { label: "Lane_1", events: [] },
        };

        const lane2 = {
            id: getNodeId(),
            position: { x: 0, y: headerHeight + laneHeight },
            parentId: parallelId,
            extent: "parent",
            expandParent: true,
            type: "parallelLane",
            draggable: false,
            style: { width: containerWidth, height: laneHeight, borderBottom: "none" },
            data: { label: "Lane_2", events: [] },
        };

        setNodes((nds) =>
            resolveNodeCollisionsAndRefit(
                [...nds, parallelNode, lane1, lane2],
                parallelId
            )
        );
        setSelectedNodeId(parallelId);
        setActiveTab("allgemein");
        setContextMenu(null);
    };

    const handleCreateEmptySubMachine = (pos) => {
        const subMachineId = getNodeId();
        const subMachineLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;

        const subMachineNode = {
            id: subMachineId,
            type: "submachine",
            position: pos,
            data: {
                label: subMachineLabel,
                fullSkillName: subMachineLabel,
                src: `\${${behaviorDirectories[0]?.key || "ROBOCUP"}}/${subMachineLabel}.xml`,
                localDataModel: [],
                isInitial: nodes.length === 0,
                events: [{ id: "success" }, { id: "failure" }],
                onOpenSubMachine: handleOpenSubMachine,
            },
        };

        const newTabId = `tab-sub-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newTabId,
            title: subMachineLabel,
            fileName: `${subMachineLabel}.xml`,
            fileHandle: null,
            filePath: null,
            nodes: [],
            edges: [],
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        };

        setTabs((prevTabs) => [
            ...prevTabs.map((t) =>
                t.id === activeTabId
                    ? { ...t, nodes, edges, slotNodes, slotEdges, globalDataModel }
                    : t
            ),
            newTabObj,
        ]);

        setNodes((nds) => [...nds, subMachineNode]);
        setContextMenu(null);

        // Direkt in den neuen Sub-Tab wechseln
        setActiveTabId(newTabId);
        setNodes([]);
        setEdges([]);
        setSlotNodes([]);
        setSlotEdges([]);
        setGlobalDataModel(newTabObj.globalDataModel);
        setSelectedNodeId(null);
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    };

    const hydrateSubMachineInheritedSlots = async (
        targetNodes,
        parentFilePath = null
    ) => {
        return Promise.all(
            (targetNodes || []).map(async (node) => {
                if (node.type !== "submachine" || !node.data?.src) {
                    return node;
                }

                try {
                    let xmlText = "";

                    if (IS_DESKTOP) {
                        const loaded = await readWorkflowSource(
                            node.data.src,
                            behaviorDirectories,
                            parentFilePath
                        );
                        xmlText = loaded.content || "";
                    } else {
                        const resolvedUrl = resolveSrcPath(
                            node.data.src,
                            DEFAULT_PREFIX_CONFIG
                        );
                        const response = await fetch(resolvedUrl);
                        if (!response.ok) return node;
                        xmlText = await response.text();
                    }

                    const declaredInheritedSlots =
                        extractInheritedSlotsFromScxml(xmlText);
                    const parsedChild = await parseScxmlFile(
                        xmlText,
                        fetchSkillData,
                        getNodeId
                    );
                    const inheritedSlots = collectInheritedSlotUsages(
                        parsedChild.nodes,
                        declaredInheritedSlots
                    );
                    const localDataModel = getLocalDataModelEntries(
                        parsedChild.globalDataModel
                    );

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            inheritedSlots,
                            localDataModel,
                        },
                    };
                } catch (error) {
                    console.warn(
                        `Could not inspect inheritSlot declarations for ${node.data.src}:`,
                        error
                    );
                    return node;
                }
            })
        );
    };

    const handleOpenSubMachine = async (srcPath, label) => {
        if (!srcPath) return;

        const fileName = srcPath.split(/[\\/]/).pop();
        const baseName = fileName.replace(/\.(xml|scxml)$/i, "");
        const currentTab = tabs.find((tab) => tab.id === activeTabId);

        let tabId = `tab-sub-${baseName}`;
        let resolvedFilePath = null;
        let xmlText = "";

        try {
            if (IS_DESKTOP) {
                // Keep srcPath symbolic in SCXML, but resolve ${KEY} to the
                // configured local directory before reading from disk.
                const loaded = await readWorkflowSource(
                    srcPath,
                    behaviorDirectories,
                    currentTab?.filePath || null
                );

                xmlText = loaded.content;
                resolvedFilePath = loaded.path;
                tabId = `tab-sub-${resolvedFilePath}`;
            } else {
                // Browser compatibility only. The desktop app resolves
                // ${KEY}/... directly from the Behavior Library.
                const resolvedUrl = resolveSrcPath(
                    srcPath,
                    DEFAULT_PREFIX_CONFIG
                );
                const response = await fetch(resolvedUrl);

                if (!response.ok) {
                    throw new Error(
                        `Server returned status ${response.status} (${response.statusText})`
                    );
                }

                xmlText = await response.text();
            }

            const existingTab = tabs.find((tab) => tab.id === tabId);
            if (existingTab) {
                switchTab(tabId);
                return;
            }

            if (!xmlText || !xmlText.includes("<scxml")) {
                throw new Error(
                    "The selected file does not contain a valid <scxml> document."
                );
            }

            const discoveredBehaviorExitEvents =
                extractBehaviorExitEventsFromScxml(xmlText);
            const declaredInheritedSlots =
                extractInheritedSlotsFromScxml(xmlText);

            const parsed = await parseScxmlFile(
                xmlText,
                fetchSkillData,
                getNodeId
            );
            const discoveredInheritedSlots =
                collectInheritedSlotUsages(
                    parsed.nodes,
                    declaredInheritedSlots
                );

            const syncedParentNodes = nodes.map((node) => {
                if (
                    node.type !== "submachine" ||
                    String(node.data?.src || "") !== String(srcPath)
                ) {
                    return node;
                }

                const existingEventsById = new Map(
                    (node.data?.events || []).map((event) => [
                        event.id,
                        event,
                    ])
                );

                return {
                    ...node,
                    data: {
                        ...node.data,
                        events:
                            discoveredBehaviorExitEvents.length > 0
                                ? discoveredBehaviorExitEvents.map(
                                    (eventId) => ({
                                        ...(existingEventsById.get(eventId) || {}),
                                        id: eventId,
                                    })
                                )
                                : node.data?.events || [],
                        inheritedSlots: discoveredInheritedSlots,
                        localDataModel: getLocalDataModelEntries(
                            parsed.globalDataModel
                        ),
                    },
                };
            });
            const parsedNodes = ensureSharedEditorInstanceIds(
                (await hydrateSubMachineInheritedSlots(
                    parsed.nodes,
                    resolvedFilePath
                )).map(normalizeSharedScxmlStateIdentity)
            );

            const inheritedForChild = buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                currentTab?.title ||
                currentTab?.fileName ||
                "Parent"
            );

            const newTabObj = {
                id: tabId,
                title: label || baseName,
                fileName:
                    resolvedFilePath?.split(/[\\/]/).pop() ||
                    fileName,
                fileHandle: null,
                filePath: resolvedFilePath,
                sourcePath: srcPath,
                nodes: parsedNodes,
                edges: parsed.edges,
                slotNodes: [],
                slotEdges: [],
                manualSlots: [],
                parentTabId: activeTabId,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: parsed.globalDataModel,
            };

            setTabs((prev) => [
                ...prev.map((tab) =>
                    tab.id === activeTabId
                        ? {
                            ...tab,
                            nodes: syncedParentNodes,
                            edges,
                            slotNodes,
                            slotEdges,
                            manualSlots,
                            globalDataModel,
                            inheritedGlobalDataModel,
                        }
                        : tab
                ),
                newTabObj,
            ]);

            setActiveTabId(tabId);
            setNodes(parsedNodes);
            setEdges(parsed.edges);
            setSlotNodes([]);
            setSlotEdges([]);
            setManualSlots([]);
            setGlobalDataModel(parsed.globalDataModel);
            setInheritedGlobalDataModel(inheritedForChild);
            setSelectedNodeId(null);
            checkSlotConnection(parsedNodes);

            setTimeout(
                () => fitView({ padding: 0.2, duration: 300 }),
                100
            );
        } catch (err) {
            console.error("Sub-Machine loading error:", err);
            alert(
                `Error loading the sub-state machine:\n${err.message}\n\nSource: ${srcPath}`
            );
        }
    };

    const selectedNodes = useMemo(() => {
        return nodes.filter((n) => n.selected && !n.parentId);
    }, [nodes]);

    // Hilfsfunktion: Bounding Box um alle ausgewählten Nodes berechnen
    const getSelectionBoundingBox = (selectedList) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        selectedList.forEach((n) => {
            const x = n.position.x;
            const y = n.position.y;
            const w = n.style?.width || 180;
            const h = n.style?.height || 80;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        return { minX, minY, maxX, maxY };
    };

    // 1. Compound State erstellen
    const handleCreateCompoundFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const {
            minX,
            minY,
            maxX,
            maxY,
        } = getSelectionBoundingBox(selectedNodes);

        const padding = 40;
        const headerOffset = 50;

        const contentWidth =
            maxX - minX + padding * 2;

        const containerWidth = Math.max(
            320,
            contentWidth + COMPOUND_PADDING_X + getCompoundExitGutterWidth([])
        );

        const containerHeight = Math.max(
            180,
            maxY -
            minY +
            padding * 2 +
            headerOffset
        );

        const compoundId = getNodeId();

        const compoundName =
            `compound_${
                nodes.filter(
                    (node) => node.type === "compound"
                ).length + 1
            }`;

        const selectedIds = new Set(
            selectedNodes.map((node) => node.id)
        );

        const initialChildId =
            selectedNodes.find((node) => node.data?.isInitial)?.id ||
            selectedNodes[0]?.id ||
            null;

        const compoundEvents = [];
        const internalExitEdges = [];


        const updatedEdges = edges.map((edge) => {
            const sourceIsInside =
                selectedIds.has(edge.source);

            const targetIsInside =
                selectedIds.has(edge.target);


            if (
                !sourceIsInside &&
                targetIsInside
            ) {
                return {
                    ...edge,

                    target: compoundId,
                    targetHandle: "target",

                    data: {
                        ...edge.data,

                        /*
                         * Merken, welche interne Node
                         * ursprünglich das Ziel war.
                         */
                        compoundOriginalTarget:
                        edge.target,
                    },
                };
            }

            if (
                sourceIsInside &&
                !targetIsInside
            ) {
                const originalSource =
                    edge.source;

                const originalHandleId =
                    String(
                        edge.sourceHandle ||
                        "success"
                    );

                const sourceNode =
                    selectedNodes.find(
                        (node) =>
                            node.id ===
                            originalSource
                    );

                const baseName =
                    sourceNode?.data?.label ||
                    sourceNode?.data
                        ?.fullSkillName
                        ?.split("#")[0]
                        ?.split(".")
                        ?.pop() ||
                    "state";

                const exitLabel =
                    `${baseName}.${originalHandleId}`;


                const compoundExitId =
                    `${originalSource}-${originalHandleId}`;


                const eventAlreadyExists =
                    compoundEvents.some(
                        (event) =>
                            String(event.id) ===
                            compoundExitId
                    );

                if (!eventAlreadyExists) {
                    compoundEvents.push({
                        id: compoundExitId,

                        /*
                         * Was der User am Rand sieht:
                         *
                         * PrintMessage.success
                         */
                        name: exitLabel,
                        rawEvent: exitLabel,

                        target: edge.target,

                        /*
                         * tatsächliche interne Source
                         */
                        sourceNodeId:
                        originalSource,

                        /*
                         * tatsächlicher Handle der
                         * internen Node
                         */
                        transitionHandleId:
                        originalHandleId,
                    });
                }

                internalExitEdges.push({
                    id:
                        `edge-internal-compound-` +
                        `${originalSource}-` +
                        `${originalHandleId}-` +
                        `${compoundId}-` +
                        `${crypto.randomUUID()}`,

                    source:
                    originalSource,

                    target:
                    compoundId,

                    /*
                     * echter Source-Handle der
                     * internen Node
                     */
                    sourceHandle:
                    originalHandleId,

                    /*
                     * LINKER Handle des Labels
                     * in CompoundNode.jsx
                     */
                    targetHandle:
                        `target-${compoundExitId}`,

                    type: "smoothstep",

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },

                    data: {
                        compoundInternalEdge: true,

                        compoundExitId:
                        compoundExitId,
                    },
                });

                return {
                    ...edge,

                    source:
                    compoundId,

                    /*
                     * RECHTER Handle des Labels
                     * in CompoundNode.jsx
                     */
                    sourceHandle:
                    compoundExitId,

                    data: {
                        ...edge.data,

                        /*
                         * Ursprüngliche interne Node merken.
                         */
                        compoundOriginalSource:
                        originalSource,

                        /*
                         * Ursprünglichen Handle merken.
                         */
                        compoundOriginalSourceHandle:
                        originalHandleId,

                        compoundExitId:
                        compoundExitId,
                    },
                };
            }

            return edge;
        });

        const compoundNode = {
            id: compoundId,

            type: "compound",

            position: {
                x: minX - padding,
                y:
                    minY -
                    padding -
                    headerOffset,
            },

            style: {
                width: containerWidth,
                height: containerHeight,
            },

            data: {
                label: compoundName,
                fullSkillName:
                compoundName,

                isInitial:
                    selectedNodes.some(
                        (node) =>
                            node.data?.isInitial
                    ),

                /*
                 * Hier landen die gerade ermittelten
                 * Exit-Labels.
                 */
                events:
                compoundEvents,

                initialChildId,

                onEntry: [],
                onExit: [],
            },
        };

        const updatedNodes = nodes.map(
            (node) => {
                if (
                    !selectedIds.has(node.id)
                ) {
                    return node;
                }

                return {
                    ...node,

                    parentId:
                    compoundId,

                    extent:
                        "parent",

                    position: {
                        x:
                            node.position.x -
                            (
                                minX -
                                padding
                            ),

                        y:
                            node.position.y -
                            (
                                minY -
                                padding -
                                headerOffset
                            ),
                    },

                    selected: false,

                    data: {
                        ...node.data,
                        isInitial:
                            node.id === initialChildId,
                    },
                };
            }
        );

        const nextNodes =
            orderNodesParentsFirst([
                compoundNode,
                ...updatedNodes,
            ]);

        setNodes(nextNodes);

        setEdges([
            ...updatedEdges,
            ...internalExitEdges,
        ]);

        requestAnimationFrame(() => {
            updateNodeInternals(
                compoundId
            );
        });

        setSelectedNodeId(
            compoundId
        );

        setActiveTab(
            "allgemein"
        );
    };

    // 2. Parallel State erstellen
    const handleCreateParallelFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const selectedIds = new Set(selectedNodes.map((n) => n.id));

        // 1. Zusammenhangskomponenten finden (über interne Kanten)
        const internalEdges = edges.filter(
            (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
        );

        const visited = new Set();
        const groups = [];

        selectedNodes.forEach((startNode) => {
            if (visited.has(startNode.id)) return;

            const currentGroup = [];
            const queue = [startNode.id];
            visited.add(startNode.id);

            while (queue.length > 0) {
                const currentId = queue.shift();
                const nodeObj = selectedNodes.find((n) => n.id === currentId);
                if (nodeObj) currentGroup.push(nodeObj);

                internalEdges.forEach((edge) => {
                    let neighborId = null;
                    if (edge.source === currentId && !visited.has(edge.target)) {
                        neighborId = edge.target;
                    } else if (edge.target === currentId && !visited.has(edge.source)) {
                        neighborId = edge.source;
                    }

                    if (neighborId && selectedIds.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push(neighborId);
                    }
                });
            }

            groups.push(currentGroup);
        });

        // 2. Präzise Breiten & Höhen pro Gruppe berechnen
        // Eine CustomNode mit langem Label oder Instance-ID benötigt ca. 220-250px
        const getNodeWidth = (node) => {
            const labelLen = (node.data?.label || "").length + (node.data?.fullSkillName || "").length;
            return Math.max(210, Math.min(300, 160 + labelLen * 3));
        };

        const getNodeHeight = (node) => {
            const eventCount = node.data?.events?.length || 0;
            return Math.max(node.style?.height || 70, 50 + eventCount * 18);
        };

        const headerHeight = 45;
        const buttonReserve = 40;
        const laneSpacing = 15;
        const laneHeights = [];
        const groupWidths = [];

        groups.forEach((group) => {
            const isCompound = group.length > 1;

            let maxH = 70;
            let totalW = 0;

            group.forEach((n) => {
                const h = getNodeHeight(n);
                if (h > maxH) maxH = h;
                totalW += getNodeWidth(n) + 40; // 40px Abstand zwischen Nodes
            });

            if (isCompound) {
                // Compound-Rahmen: Header (35px) + Node-Höhe + Rand-Padding (40px)
                laneHeights.push(Math.max(170, maxH + 75));
                // Breite: Padding links/rechts (60px) + Exit-Handle-Puffer (120px)
                groupWidths.push(totalW + 160);
            } else {
                laneHeights.push(Math.max(130, maxH + 40));
                groupWidths.push(
                    group.length > 1
                        ? totalW + 80
                        : getNodeWidth(group[0]) + 160
                );
            }
        });

        // Der Gesamt-Container muss so breit sein wie die breiteste Gruppe (mind. 480px)
        const containerWidth = Math.max(480, ...groupWidths);
        const totalLanesHeight = laneHeights.reduce((sum, h) => sum + h, 0);
        const containerHeight = headerHeight + totalLanesHeight + buttonReserve;

        const {
            minX,
            minY,
            maxX,
            maxY,
        } = getSelectionBoundingBox(selectedNodes);

        const parallelId = getNodeId();

        const parallelName =
            `parallel_${
                nodes.filter((n) => n.type === "parallel").length + 1
            }`;

        const branchNames = groups.map((group, idx) => {
            if (group.length > 1) {
                return `Group_${idx + 1}`;
            }

            return (
                group[0].data?.label ||
                `Lane_${idx + 1}`
            );
        });

        const parallelNode = {
            id: parallelId,
            type: "parallel",

            position: {
                x: minX - 30,
                y: minY - 30 - headerHeight,
            },

            style: {
                width: containerWidth,
                height: containerHeight,
            },

            data: {
                label: parallelName,
                fullSkillName: parallelName,

                isInitial: selectedNodes.some(
                    (n) => n.data?.isInitial
                ),

                lanes: branchNames,
                events: [],
                onAddLane: handleAddLaneToParallel,
                onEntry: [],
                onExit: [],
            },
        };

        const oldSelectionRight = maxX;

        const newParallelRight =
            parallelNode.position.x +
            containerWidth;

        const horizontalGrowth = Math.max(
            0,
            newParallelRight - oldSelectionRight
        );

        const parallelGap = 50;

        const shiftX =
            horizontalGrowth > 0
                ? horizontalGrowth + parallelGap
                : 0;

        const newLanes = [];
        const newCompounds = [];
        const movedNodes = [];
        let currentLaneY = headerHeight;
        const nodeToLaneMap = new Map();

        // 3. Lanes, Compounds und Nodes erzeugen
        groups.forEach((group, idx) => {
            const laneId = getNodeId();
            const laneName = branchNames[idx];
            const laneHeight = laneHeights[idx];

            // Für spätere Transition-Umbiegung merken,
            // welcher State zu welcher Lane gehört.
            group.forEach((node) => {
                nodeToLaneMap.set(node.id, laneId);
            });

            // Lane erstellen
            newLanes.push({
                id: laneId,
                position: {
                    x: 0,
                    y: currentLaneY,
                },
                parentId: parallelId,
                extent: "parent",
                expandParent: true,
                type: "parallelLane",
                draggable: false,
                selectable: false,

                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom:
                        idx < groups.length - 1
                            ? "1.5px solid #0284c7"
                            : "none",
                },

                data: {
                    label: laneName,
                    events: [],
                },
            });

            // States DIREKT in die Lane.
            // Kein Group_X_Part Compound mehr.
            let currentX = 25;

            group.forEach((node) => {
                const nodeWidth = getNodeWidth(node);

                movedNodes.push({
                    ...node,
                    parentId: laneId,
                    extent: "parent",
                    expandParent: true,

                    position: {
                        x: currentX,
                        y: 20,
                    },

                    selected: false,
                });

                currentX += nodeWidth + PARALLEL_NODE_GAP;
            });

            currentLaneY += laneHeight;
        });

        // 4. Kanten umbiegen
        const newEdgesToAdd = [];
        const updatedEdges = edges.map((edge) => {
            const isSourceSelected = selectedIds.has(edge.source);
            const isTargetSelected = selectedIds.has(edge.target);

            // Eingehend von außen -> auf den Parallel-Container
            if (!isSourceSelected && isTargetSelected) {
                return {
                    ...edge,
                    target: parallelId,
                    targetHandle: "target",
                    data: {
                        ...edge.data,
                        parallelOriginalTarget: edge.target,
                    },
                };
            }

            // Ausgehend nach außen -> an den Rand der entsprechenden Lane
            if (isSourceSelected && !isTargetSelected) {
                const laneId = nodeToLaneMap.get(edge.source);
                const laneNode = newLanes.find((l) => l.id === laneId);
                const handleId = edge.sourceHandle || "success";

                const sourceNode = selectedNodes.find((n) => n.id === edge.source);
                const baseSkillName = sourceNode?.data?.label || sourceNode?.data?.fullSkillName?.split("#")[0]?.split(".")?.pop() || "";
                const exitLabel = `${baseSkillName}.${handleId}`;

                if (laneNode && !laneNode.data.events.some((ev) => ev.id === handleId)) {
                    laneNode.data.events.push({
                        id: handleId,
                        rawEvent: exitLabel,
                        name: exitLabel,
                        target: edge.target,
                    });
                }

                newEdgesToAdd.push({
                    id: `edge-internal-${edge.source}-${handleId}-${laneId}`,
                    source: edge.source,
                    target: laneId,
                    sourceHandle: handleId,
                    targetHandle: `target-${handleId}`,
                    style: { strokeDasharray: "4 4", stroke: "#0284c7", strokeWidth: 1.5 },
                    type: "smartTransition",
                });

                return {
                    ...edge,
                    source: laneId,
                    sourceHandle: handleId,
                    data: {
                        ...edge.data,
                        parallelOriginalSource: edge.source,
                    },
                };
            }

            return edge;
        });

        let insertIndex = nodes.findIndex((n) => selectedIds.has(n.id));
        if (insertIndex === -1) insertIndex = 0;

        const remainingNodes = nodes
            .filter((n) => {
                if (selectedIds.has(n.id)) {
                    return false;
                }

                if (n.type === "compound") {
                    const hasRemainingChildren = nodes.some(
                        (child) =>
                            child.parentId === n.id &&
                            !selectedIds.has(child.id)
                    );

                    return hasRemainingChildren;
                }

                return true;
            })
            .map((node) => {
                /*
                 * Nur Root-Nodes verschieben.
                 *
                 * Kinder eines Compound-/Parallel-/Submachine-Nodes
                 * werden automatisch mit ihrem Parent verschoben.
                 */
                if (node.parentId) {
                    return node;
                }

                const nodeX =
                    Number(node.position?.x) || 0;

                /*
                 * Alles, was vorher rechts hinter der ausgewählten
                 * Gruppe lag, gemeinsam nach rechts verschieben.
                 *
                 * Dadurch bleibt die vorhandene Anordnung erhalten.
                 */
                if (
                    shiftX > 0 &&
                    nodeX >= oldSelectionRight
                ) {
                    return {
                        ...node,
                        position: {
                            ...node.position,
                            x: nodeX + shiftX,
                        },
                    };
                }

                return node;
            });

        const newRootNodes = [...remainingNodes];
        newRootNodes.splice(insertIndex, 0, parallelNode);

        setNodes([...newRootNodes, ...newLanes, ...movedNodes]);
        setEdges([...updatedEdges, ...newEdgesToAdd]);
        setSelectedNodeId(parallelId);
        setActiveTab("allgemein");
    };

    // 3. Sub-State-Machine erstellen & direkt in neuem Tab öffnen
    const handleCreateSubMachineFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const { minX, minY } = getSelectionBoundingBox(selectedNodes);
        const subMachineId = getNodeId();
        const subMachineLabel = `SubMachine_${nodes.filter((n) => n.type === "submachine").length + 1}`;
        const selectedIds = new Set(selectedNodes.map((n) => n.id));

        // 1. Externe Transitions für die Handles der Sub-Machine-Node im Parent sammeln
        const externalEvents = [];
        edges.forEach((edge) => {
            if (selectedIds.has(edge.source) && !selectedIds.has(edge.target)) {
                const evHandle = edge.sourceHandle || "success";
                if (!externalEvents.some((e) => e.id === evHandle)) {
                    externalEvents.push({
                        id: evHandle,
                        name: evHandle,
                        rawEvent: evHandle,
                        target: edge.target,
                        cond: edge.data?.cond || "",
                    });
                }
            }
        });

        // 2. Neue Sub-Machine-Knoten für den aktuellen (Parent-)Workflow vorbereiten
        const subMachineNode = {
            id: subMachineId,
            type: "submachine",
            position: { x: minX, y: minY },
            data: {
                label: subMachineLabel,
                fullSkillName: subMachineLabel,
                localDataModel: [],
                src: `\${${behaviorDirectories[0]?.key || "ROBOCUP"}}/${subMachineLabel}.xml`,
                isInitial: selectedNodes.some((n) => n.data?.isInitial),
                events: externalEvents.length > 0 ? externalEvents : [{ id: "success" }, { id: "failure" }],
                onEntry: [],
                onExit: [],
                onOpenSubMachine: handleOpenSubMachine,
            },
        };

// 3. Kanten im Parent anpassen (externe Kanten an die SubMachine heften, interne entfernen)
        const updatedParentEdges = edges
            .map((edge) => {
                if (selectedIds.has(edge.source) && !selectedIds.has(edge.target)) {
                    return { ...edge, source: subMachineId };
                }
                if (!selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                    return { ...edge, target: subMachineId };
                }
                if (selectedIds.has(edge.source) && selectedIds.has(edge.target)) {
                    return null; // Geht in den neuen Sub-Tab über
                }
                return edge;
            })
            .filter(Boolean);

        const remainingParentNodes = [
            ...nodes.filter((n) => !selectedIds.has(n.id)),
            subMachineNode,
        ];

// 4. Nodes für das neue Sub-Machine-Tab normalisieren (Koordinaten relativ zum Ursprung)
        const subTabNodes = selectedNodes.map((n) => ({
            ...n,
            position: {
                x: n.position.x - minX + 50,
                y: n.position.y - minY + 50,
            },
            selected: false,
        }));

// Nur interne Kanten für den Sub-Tab mitnehmen
        const subTabEdges = edges.filter(
            (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)
        );

// 5. Neues Tab-Objekt anlegen
        const parentTab = tabs.find((tab) => tab.id === activeTabId);
        const inheritedForChild = buildInheritedGlobalsForChild(
            inheritedGlobalDataModel,
            globalDataModel,
            parentTab?.title || parentTab?.fileName || "Parent"
        );

        const newTabId = `tab-sub-${crypto.randomUUID().slice(0, 6)}`;
        const newTabObj = {
            id: newTabId,
            title: subMachineLabel,
            fileName: `${subMachineLabel}.xml`,
            fileHandle: null,
            filePath: null,
            nodes: subTabNodes,
            edges: subTabEdges,
            slotNodes: [],
            slotEdges: [],
            manualSlots: [],
            parentTabId: activeTabId,
            inheritedGlobalDataModel: inheritedForChild,
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        };

// 6. Parent-Tab mit verbleibenden Nodes speichern und neuen Sub-Tab anhängen
        setTabs((prevTabs) => [
            ...prevTabs.map((t) =>
                t.id === activeTabId
                    ? {
                        ...t,
                        nodes: remainingParentNodes,
                        edges: updatedParentEdges,
                        slotNodes,
                        slotEdges,
                        manualSlots,
                        globalDataModel,
                        inheritedGlobalDataModel,
                    }
                    : t
            ),
            newTabObj,
        ]);

// 7. Direkt in den neuen Sub-Machine-Tab wechseln
        setActiveTabId(newTabId);
        setNodes(subTabNodes);
        setEdges(subTabEdges);
        setSlotNodes([]);
        setSlotEdges([]);
        setManualSlots([]);
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel(inheritedForChild);
        setSelectedNodeId(null);

// Slot-Verbindungen des neuen Tabs berechnen & View zentrieren
        checkSlotConnection(subTabNodes);
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    };

    const handleOpenStateActions = useCallback(
        (nodeId) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: node.id === nodeId,
                }))
            );

            setSelectedNodeId(nodeId);
            setRightPanelTab("details");
            setActiveTab("actions");
        },
        [setNodes]
    );

    const handleOpenParameter = useCallback(
        (nodeId, parameterKey) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: node.id === nodeId,
                }))
            );

            setSelectedNodeId(nodeId);
            setRightPanelTab("details");
            setActiveTab("parameter");
            parameterFocusRequestIdRef.current += 1;
            setParameterFocusRequest({
                nodeId,
                parameterKey,
                requestId: parameterFocusRequestIdRef.current,
            });
        },
        [setNodes]
    );

    const handleOpenSlot = useCallback(
        (nodeId, access, slotKey) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: node.id === nodeId,
                }))
            );

            setSelectedNodeId(nodeId);
            setRightPanelTab("details");
            setActiveTab("slots");
            slotFocusRequestIdRef.current += 1;
            setSlotFocusRequest({
                nodeId,
                access,
                slotKey,
                requestId: slotFocusRequestIdRef.current,
            });
        },
        [setNodes]
    );

    const handleOpenTransition = useCallback(
        (nodeId, eventId) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: node.id === nodeId,
                }))
            );

            setSelectedNodeId(nodeId);
            setRightPanelTab("details");
            setActiveTab("allgemein");
            transitionFocusRequestIdRef.current += 1;
            setTransitionFocusRequest({
                nodeId,
                eventId,
                requestId: transitionFocusRequestIdRef.current,
            });
        },
        [setNodes]
    );

    const handleToggleContainerCollapse = useCallback(
        (containerId) => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== containerId) return node;
                    if (node.type !== "compound" && node.type !== "parallel") {
                        return node;
                    }

                    const isCollapsed = Boolean(node.data?.isCollapsed);

                    if (!isCollapsed) {
                        // NodeResizer writes the resized dimensions onto the real
                        // React Flow node. Remember those dimensions before
                        // replacing the height with the compact collapsed height.
                        const expandedWidth =
                            Number(node.width) ||
                            Number(node.measured?.width) ||
                            Number(node.style?.width) ||
                            (node.type === "compound" ? 320 : 420);
                        const expandedHeight =
                            Number(node.height) ||
                            Number(node.measured?.height) ||
                            Number(node.style?.height) ||
                            (node.type === "compound" ? 220 : 295);
                        const collapsedHeight =
                            node.type === "compound"
                                ? Math.max(
                                    48,
                                    28 +
                                    (Array.isArray(node.data?.events)
                                        ? node.data.events.length
                                        : 0) *
                                    22
                                )
                                : 44;

                        return {
                            ...node,
                            // NodeResizer stores the current size on the node's
                            // top-level width/height fields. Those values take
                            // precedence over style.width/style.height in React
                            // Flow, so collapse has to update both places.
                            width: expandedWidth,
                            height: collapsedHeight,
                            style: {
                                ...(node.style || {}),
                                width: expandedWidth,
                                height: collapsedHeight,
                                minHeight: collapsedHeight,
                            },
                            data: {
                                ...(node.data || {}),
                                isCollapsed: true,
                                expandedContainerSize: {
                                    width: expandedWidth,
                                    height: expandedHeight,
                                    minHeight: node.style?.minHeight ?? null,
                                },
                            },
                        };
                    }

                    const savedSize = node.data?.expandedContainerSize || {};
                    const restoredStyle = {
                        ...(node.style || {}),
                        width:
                            Number(savedSize.width) ||
                            Number(node.style?.width) ||
                            (node.type === "compound" ? 320 : 420),
                        height:
                            Number(savedSize.height) ||
                            (node.type === "compound" ? 220 : 295),
                    };

                    if (savedSize.minHeight == null) {
                        delete restoredStyle.minHeight;
                    } else {
                        restoredStyle.minHeight = savedSize.minHeight;
                    }

                    const restoredWidth =
                        Number(savedSize.width) ||
                        Number(node.width) ||
                        Number(restoredStyle.width) ||
                        (node.type === "compound" ? 320 : 420);
                    const restoredHeight =
                        Number(savedSize.height) ||
                        (node.type === "compound" ? 220 : 295);

                    restoredStyle.width = restoredWidth;
                    restoredStyle.height = restoredHeight;

                    return {
                        ...node,
                        // Restore the actual React Flow dimensions as well as
                        // the CSS dimensions so an expanded, previously resized
                        // container returns to exactly its saved size.
                        width: restoredWidth,
                        height: restoredHeight,
                        style: restoredStyle,
                        data: {
                            ...(node.data || {}),
                            isCollapsed: false,
                        },
                    };
                })
            );

            // Force React Flow to re-measure the node after changing its actual
            // dimensions. This is important after the node has been resized.
            requestAnimationFrame(() => updateNodeInternals(containerId));

            // Keep the visible container selected rather than leaving a hidden
            // child selected in the details panel after collapsing it.
            setSelectedNodeId(containerId);
        },
        [setNodes, updateNodeInternals]
    );

    const hiddenNodeIds = useMemo(() => {
        const hidden = new Set();

        nodes
            .filter(
                (node) =>
                    (node.type === "compound" || node.type === "parallel") &&
                    Boolean(node.data?.isCollapsed)
            )
            .forEach((container) => {
                getDescendantNodeIds(container.id, nodes).forEach((id) =>
                    hidden.add(id)
                );
            });

        return hidden;
    }, [nodes]);

    const injectedNodes = useMemo(() => {
        return nodes.map((n) => {
            const injectedData = {
                ...n.data,
                mode: activeMode,
                onOpenStateActions: handleOpenStateActions,
                onOpenParameter: handleOpenParameter,
                onOpenSlot: handleOpenSlot,
                onOpenTransition: handleOpenTransition,
                mode: activeMode,
                slotConnectionDrag,
                onToggleCollapse: handleToggleContainerCollapse,
            };

            if (n.type === "submachine") {
                injectedData.onOpenSubMachine = handleOpenSubMachine;

                // If this sub-state machine is open as a child tab, use that
                // tab's current datamodel for the Overview card. This keeps
                // the parent node in sync after editing the child workflow.
                const srcFileName = String(n.data?.src || "")
                    .split(/[\\/]/)
                    .pop()
                    ?.replace(/\.(xml|scxml)$/i, "");

                const childTab = tabs.find((tab) => {
                    if (tab.parentTabId !== activeTabId) return false;

                    const tabFileName = String(tab.fileName || "")
                        .split(/[\\/]/)
                        .pop()
                        ?.replace(/\.(xml|scxml)$/i, "");

                    return (
                        (tab.sourcePath &&
                            String(tab.sourcePath) === String(n.data?.src || "")) ||
                        String(tab.title || "") === String(n.data?.label || "") ||
                        (srcFileName && tabFileName === srcFileName)
                    );
                });

                if (childTab) {
                    injectedData.localDataModel = getLocalDataModelEntries(
                        childTab.globalDataModel
                    );
                }
            }

            if (n.type === "parallel") {
                injectedData.onAddLane = handleAddLaneToParallel;
            }

            return {
                ...n,
                hidden: hiddenNodeIds.has(n.id),
                data: injectedData,
            };
        });
    }, [
        nodes,
        tabs,
        activeTabId,
        activeMode,
        handleAddLaneToParallel,
        handleOpenStateActions,
        handleOpenParameter,
        handleToggleContainerCollapse,
        hiddenNodeIds,
        activeMode,
        slotConnectionDrag,
    ]);

    const injectedSlotNodes = useMemo(
        () =>
            slotNodes.map((node) => ({
                ...node,
                data: {
                    ...node.data,
                    slotConnectionDrag,
                },
            })),
        [slotNodes, slotConnectionDrag]
    );

    const [isReloadingSkills, setIsReloadingSkills] = useState(false);
    const [skillLibraryRefreshVersion, setSkillLibraryRefreshVersion] = useState(0);
    const skillLibrarySignatureRef = useRef("");

    const fetchSkills = useCallback(async ({ manual = false } = {}) => {
        if (manual) {
            setIsReloadingSkills(true);
        }

        try {
            const response = await fetch("/api/skills", { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            const normalizedSkills = Array.isArray(data?.skills)
                ? [...data.skills].sort()
                : [];
            const signature = JSON.stringify(normalizedSkills);
            const changed = signature !== skillLibrarySignatureRef.current;

            if (changed) {
                skillLibrarySignatureRef.current = signature;
                setSkills(data);
                setSkillLibraryRefreshVersion((version) => version + 1);
            }

            return changed;
        } catch (error) {
            console.error("Error loading skills:", error);
            return false;
        } finally {
            if (manual) {
                setIsReloadingSkills(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchSkills();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchSkills();
            }
        }, 3000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchSkills();
            }
        };

        const handleWindowFocus = () => fetchSkills();

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [fetchSkills]);

    const normalizeSkillApiParamValue = (value) => {
        if (typeof value !== "string") return value;

        const trimmed = value.trim();
        if (trimmed.length < 2) return trimmed;

        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first !== "\"" && first !== "'") || last !== first) {
            return trimmed;
        }

        // SkillConfigurator expects the actual parameter value. SCXML/editor
        // strings, however, are represented as quoted expressions (e.g.
        // 'Foo'). Strip only that outer literal quoting before calling the API.
        const inner = trimmed.slice(1, -1);
        return inner.replace(/\\([\\'\"])/g, "$1");
    };

    const normalizeSkillApiParams = (params) => {
        if (!params || typeof params !== "object") return {};

        return Object.fromEntries(
            Object.entries(params)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => [
                    key,
                    normalizeSkillApiParamValue(value),
                ])
        );
    };

    const fetchSkillData = async (fullSkillName, params = null) => {
        const apiParams = normalizeSkillApiParams(params);
        const hasParams = Object.keys(apiParams).length > 0;

        try {
            const response = await fetch(`/api/skill/${fullSkillName}`, {
                ...(hasParams
                    ? {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ params: apiParams }),
                    }
                    : { cache: "no-store" }),
            });

            if (response.ok) {
                return await response.json();
            }

            if (!hasParams) {
                throw new Error(`Server returned ${response.status}`);
            }

            console.warn(
                `Parameterized skill configuration failed for ${fullSkillName} (${response.status}); falling back to the base skill definition.`
            );
        } catch (error) {
            if (!hasParams) {
                console.error(`Error loading skill ${fullSkillName}:`, error);
                return null;
            }

            console.warn(
                `Parameterized skill configuration failed for ${fullSkillName}; falling back to the base skill definition.`,
                error
            );
        }

        // Parameter expressions can legitimately be non-literal (for example
        // references to datamodel variables). If the backend cannot configure
        // those values at edit time, keep the workflow usable with the static
        // skill definition instead of losing all requests during import.
        try {
            const fallbackResponse = await fetch(`/api/skill/${fullSkillName}`, {
                cache: "no-store",
            });
            if (!fallbackResponse.ok) {
                throw new Error(`Server returned ${fallbackResponse.status}`);
            }
            return await fallbackResponse.json();
        } catch (fallbackError) {
            console.error(`Error loading skill ${fullSkillName}:`, fallbackError);
            return null;
        }
    };


    const handleOpenBehaviorFile = useCallback(
        async (behavior) => {
            if (!behavior?.source) return;

            try {
                // behavior.source remains ${KEY}/... for SCXML portability.
                // readWorkflowSource expands it only for local file access.
                const loaded = await readWorkflowSource(
                    behavior.source,
                    behaviorDirectories,
                    null
                );

                const tabId = `tab-behavior-${loaded.path}`;
                const existingTab = tabs.find(
                    (tab) => tab.id === tabId
                );

                if (existingTab) {
                    switchTab(tabId);
                    return;
                }

                const parsed = await parseScxmlFile(
                    loaded.content,
                    fetchSkillData,
                    getNodeId
                );
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(
                        parsed.nodes,
                        loaded.path
                    )).map(normalizeSharedScxmlStateIdentity)
                );

                const newTabObj = {
                    id: tabId,
                    title:
                        behavior.name?.replace(
                            /\.(xml|scxml)$/i,
                            ""
                        ) || loaded.file_name,
                    fileName: loaded.file_name,
                    fileHandle: null,
                    filePath: loaded.path,
                    sourcePath: behavior.source,
                    nodes: parsedNodes,
                    edges: parsed.edges,
                    slotNodes: [],
                    slotEdges: [],
                    manualSlots: [],
                    parentTabId: null,
                    inheritedGlobalDataModel: [],
                    globalDataModel: parsed.globalDataModel,
                };

                setTabs((previousTabs) => [
                    ...previousTabs.map((tab) =>
                        tab.id === activeTabId
                            ? {
                                ...tab,
                                nodes,
                                edges,
                                slotNodes,
                                slotEdges,
                                manualSlots,
                                globalDataModel,
                                inheritedGlobalDataModel,
                            }
                            : tab
                    ),
                    newTabObj,
                ]);

                setActiveTabId(tabId);
                setNodes(parsedNodes);
                setEdges(parsed.edges);
                setSlotNodes([]);
                setSlotEdges([]);
                setManualSlots([]);
                setGlobalDataModel(parsed.globalDataModel);
                setInheritedGlobalDataModel([]);
                setSelectedNodeId(null);
                checkSlotConnection(parsedNodes);

                setTimeout(
                    () =>
                        fitView({
                            padding: 0.2,
                            duration: 300,
                        }),
                    100
                );
            } catch (error) {
                console.error(
                    "Could not open behavior:",
                    error
                );
                alert(
                    `Could not open behavior:\n${error.message}`
                );
            }
        },
        [
            behaviorDirectories,
            tabs,
            activeTabId,
            nodes,
            edges,
            slotNodes,
            slotEdges,
            manualSlots,
            globalDataModel,
            inheritedGlobalDataModel,
            fitView,
        ]
    );

    const createBehaviorNode = useCallback(
        async (behavior, position) => {
            const baseName = String(
                behavior?.name || "Behavior"
            ).replace(/\.(xml|scxml)$/i, "");

            let behaviorEvents = [];
            let inheritedSlots = [];
            let localDataModel = [];

            try {
                if (behavior?.source) {
                    let behaviorContent = "";

                    if (IS_DESKTOP) {
                        const loaded = await readWorkflowSource(
                            behavior.source,
                            behaviorDirectories,
                            null
                        );
                        behaviorContent = loaded.content || "";
                    } else {
                        const resolvedUrl = resolveSrcPath(
                            behavior.source,
                            DEFAULT_PREFIX_CONFIG
                        );
                        const response = await fetch(resolvedUrl);
                        if (response.ok) {
                            behaviorContent = await response.text();
                        }
                    }

                    if (behaviorContent) {
                        behaviorEvents = extractBehaviorExitEventsFromScxml(
                            behaviorContent
                        );
                        const declaredInheritedSlots =
                            extractInheritedSlotsFromScxml(behaviorContent);
                        const parsedBehavior = await parseScxmlFile(
                            behaviorContent,
                            fetchSkillData,
                            getNodeId
                        );
                        inheritedSlots = collectInheritedSlotUsages(
                            parsedBehavior.nodes,
                            declaredInheritedSlots
                        );
                        localDataModel = getLocalDataModelEntries(
                            parsedBehavior.globalDataModel
                        );
                    }
                }
            } catch (error) {
                console.warn(
                    `Could not inspect behavior exits for ${behavior?.source || baseName}:`,
                    error
                );
            }

            // Prefer the real outward events emitted by Nop nodes. Keep the
            // legacy fallback only when the source cannot be inspected or
            // does not expose an outward Nop event.
            const events = (
                behaviorEvents.length > 0
                    ? behaviorEvents
                    : ["success", "failure"]
            ).map((eventId) => ({ id: eventId }));

            return {
                id: getNodeId(),
                position,
                type: "submachine",
                data: {
                    label: baseName,
                    fullSkillName: baseName,
                    src: behavior.source,
                    isInitial: false,
                    events,
                    inheritedSlots,
                    localDataModel,
                    onEntry: [],
                    onExit: [],
                    onOpenSubMachine: handleOpenSubMachine,
                },
            };
        },
        [behaviorDirectories, handleOpenSubMachine]
    );

    const selectedRawNode =
        [...nodes, ...slotNodes].find((node) => node.id === selectedNodeId) || null;

    // Keep a clicked slot selected as the slot itself. Previously slot nodes
    // were converted to the first skill that used the path, which prevented a
    // dedicated slot detail view and made multi-skill slots ambiguous.
    const selectedNode = selectedRawNode;

    const selectedSlotDetails = useMemo(() => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") {
            return null;
        }

        const cleanPath = getSlotPathFromNode(selectedRawNode);
        const skillAccesses = [];
        const accessTypes = new Set();
        const dataTypes = new Set();

        nodes.forEach((node) => {
            const skillName =
                node.data?.fullSkillName ||
                node.data?.label ||
                node.id;

            (node.data?.inSlots || []).forEach((slot, slotIndex) => {
                if (normalizeSlotPath(slot?.path) !== cleanPath) return;
                accessTypes.add("read");
                if (slot?.type) dataTypes.add(String(slot.type));
                skillAccesses.push({
                    nodeId: node.id,
                    skillName,
                    key: slot?.key || `input ${slotIndex + 1}`,
                    type: slot?.type || "Unknown",
                    description: slot?.description || "",
                    access: "read",
                    slotIndex,
                });
            });

            (node.data?.outSlots || []).forEach((slot, slotIndex) => {
                if (normalizeSlotPath(slot?.path) !== cleanPath) return;
                accessTypes.add("write");
                if (slot?.type) dataTypes.add(String(slot.type));
                skillAccesses.push({
                    nodeId: node.id,
                    skillName,
                    key: slot?.key || `output ${slotIndex + 1}`,
                    type: slot?.type || "Unknown",
                    description: slot?.description || "",
                    access: "write",
                    slotIndex,
                });
            });
        });

        (selectedRawNode.data?.requiredByChildren || []).forEach((entry) => {
            if (entry?.access === "read" || entry?.access === "write") {
                accessTypes.add(entry.access);
            }
        });

        const nodeType = String(selectedRawNode.data?.slotType || "").trim();
        const dataType =
            dataTypes.size === 1
                ? [...dataTypes][0]
                : nodeType ||
                (dataTypes.size > 1
                    ? [...dataTypes].join(" / ")
                    : "Unknown");

        return {
            path: cleanPath ? `/${cleanPath}` : "",
            dataType,
            accessTypes: ["read", "write"].filter((access) =>
                accessTypes.has(access)
            ),
            isInherited: Boolean(
                selectedRawNode.data?.currentMachineInherited
            ),
            skillAccesses,
        };
    }, [selectedRawNode, nodes]);

    // OnEntry/OnExit has asymmetric scope for sub-state-machines:
    // - assignment location belongs to the child machine's local datamodel
    // - assignment expression is evaluated in the parent workflow scope
    const selectedActionDataModel = useMemo(() => {
        if (!selectedNode || selectedNode.type !== "submachine") {
            return availableDataModelParameters;
        }

        const srcFileName = String(selectedNode.data?.src || "")
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.(xml|scxml)$/i, "");

        // Prefer the live child tab when the sub-state machine is currently
        // open. This means Entry/Exit assignment locations immediately track
        // edits to the child machine's own datamodel.
        const childTab = tabs.find((tab) => {
            if (tab.parentTabId !== activeTabId) return false;

            const tabFileName = String(tab.fileName || "")
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.(xml|scxml)$/i, "");

            return (
                (tab.sourcePath &&
                    String(tab.sourcePath) === String(selectedNode.data?.src || "")) ||
                String(tab.title || "") === String(selectedNode.data?.label || "") ||
                (srcFileName && tabFileName === srcFileName)
            );
        });

        if (childTab) {
            return getLocalDataModelEntries(childTab.globalDataModel);
        }

        // A behavior that has not been opened yet is hydrated with its local
        // datamodel when its source file is inspected. Never fall back to the
        // parent's datamodel for a sub-state-machine action.
        return getLocalDataModelEntries(
            selectedNode.data?.localDataModel || []
        );
    }, [
        selectedNode,
        tabs,
        activeTabId,
        availableDataModelParameters,
    ]);

    const selectedActionExpressionVariables = useMemo(() => {
        // The expression of an action attached to a sub-state-machine is
        // evaluated by the parent state machine. Therefore @variable
        // references must come from the parent/current workflow, not from the
        // child machine whose local datamodel supplies `location`.
        return availableDataModelParameters;
    }, [availableDataModelParameters]);

    const selectedInitialScopeParentId =
        selectedNode?.parentId || null;

    const hasInitialNode = nodes.some(
        (node) =>
            Boolean(node.data?.isInitial) &&
            (node.parentId || null) ===
            selectedInitialScopeParentId
    );

    const canvasSlotPathOptions = useMemo(() => {
        const options = new Map();

        const addOption = (slot) => {
            const cleanPath = normalizeSlotPath(slot?.path);
            const type = String(slot?.type || "").trim();
            if (!cleanPath || !type) return;

            const key = `${cleanPath}|${normalizeSlotType(type)}`;
            if (!options.has(key)) {
                options.set(key, {
                    path: `/${cleanPath}`,
                    type,
                });
            }
        };

        nodes.forEach((node) => {
            (node.data?.inSlots || []).forEach(addOption);
            (node.data?.outSlots || []).forEach(addOption);
        });
        (manualSlots || []).forEach(addOption);

        return [...options.values()].sort((a, b) =>
            a.path.localeCompare(b.path)
        );
    }, [nodes, manualSlots]);

    const canvasSkillSlotOptions = useMemo(() => {
        const options = [];

        nodes.forEach((node) => {
            if (node.type !== "custom") return;

            const nodeLabel =
                node.data?.fullSkillName ||
                node.data?.label ||
                node.id;

            (node.data?.inSlots || []).forEach((slot, index) => {
                if (!slot?.key || !String(slot?.type || "").trim()) return;
                if (slot.path && slot.path.trim()) return;
                options.push({
                    id: `${node.id}-read-${index}`,
                    nodeId: node.id,
                    nodeLabel,
                    access: "read",
                    slotIndex: index,
                    key: slot.key,
                    type: slot.type,
                });
            });

            (node.data?.outSlots || []).forEach((slot, index) => {
                if (!slot?.key || !String(slot?.type || "").trim()) return;
                if (slot.path && slot.path.trim()) return;
                options.push({
                    id: `${node.id}-write-${index}`,
                    nodeId: node.id,
                    nodeLabel,
                    access: "write",
                    slotIndex: index,
                    key: slot.key,
                    type: slot.type,
                });
            });
        });

        return options;
    }, [nodes]);

    const activeWorkflowTab = useMemo(
        () => tabs.find((tab) => tab.id === activeTabId) || null,
        [tabs, activeTabId]
    );

    const isBehaviorWorkflow = Boolean(
        activeWorkflowTab?.sourcePath ||
        activeWorkflowTab?.parentTabId
    );

    const editorProblems = useMemo(
        () =>
            buildEditorProblems(
                nodes,
                edges,
                globalDataModel,
                behaviorDirectories,
                isBehaviorWorkflow
            ),
        [
            nodes,
            edges,
            globalDataModel,
            behaviorDirectories,
            isBehaviorWorkflow,
        ]
    );

    const errorProblemCount = useMemo(
        () =>
            editorProblems.filter(
                (problem) => problem.severity === "error"
            ).length,
        [editorProblems]
    );

    const handleProblemClick = useCallback(
        (problem) => {
            if (!problem) return;

            if (problem.mode) {
                setActiveMode(problem.mode);
            }

            setEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: Boolean(
                        problem.edgeId &&
                        edge.id === problem.edgeId
                    ),
                }))
            );

            if (problem.nodeId) {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.id === problem.nodeId,
                    }))
                );
                setSelectedNodeId(problem.nodeId);
                setActiveTab(problem.detailTab || "allgemein");
                setRightPanelTab("details");
            } else if (problem.category === "Datamodel") {
                setSelectedNodeId(null);
                setRightPanelTab("datamodel");
            }

            const focusIds = (
                problem.focusNodeIds?.length
                    ? problem.focusNodeIds
                    : problem.nodeId
                        ? [problem.nodeId]
                        : []
            ).filter((id) =>
                nodes.some((node) => node.id === id)
            );

            if (focusIds.length > 0) {
                window.setTimeout(() => {
                    fitView({
                        nodes: focusIds.map((id) => ({ id })),
                        padding: 0.55,
                        maxZoom: 1.25,
                        duration: 300,
                    });
                }, 0);
            }
        },
        [nodes, setNodes, setEdges, fitView]
    );

// Multi-level package/subpackage parser
    let packages = [];
    let directSkills = [];

    (skills.skills || []).forEach((skill) => {
        const afterSkills = skill.split("skills.")[1];
        if (!afterSkills) return;
        const parts = afterSkills.split(".");

        if (parts.length === 1) {
            directSkills.push(skill);
        } else {
            const packageName = parts[0];
            if (!packages.includes(packageName)) {
                packages.push(packageName);
            }
        }
    });

    let packageSkills = [];
    let subPackages = [];

    if (selectedPackage !== null) {
        (skills.skills || []).forEach((skill) => {
            const afterSkill = skill.split("skills.")[1];
            if (!afterSkill) return;
            const parts = afterSkill.split(".");

            if (parts[0] !== selectedPackage) {
                return;
            }

            if (selectedSubPackage === null) {
                if (parts.length === 2) {
                    packageSkills.push(skill);
                }
                if (parts.length > 2) {
                    const subPackageName = parts[1];
                    if (!subPackages.includes(subPackageName)) {
                        subPackages.push(subPackageName);
                    }
                }
            } else {
                if (parts[1] === selectedSubPackage && parts.length === 3) {
                    packageSkills.push(skill);
                }
            }
        });
    }

    packageSkills = packageSkills.filter((skill) =>
        skill.toLowerCase().includes(searchText.toLowerCase())
    );

    const searchedSkills = (skills.skills || []).filter((s) => s.toLowerCase().includes(searchText.toLowerCase()));

    const filteredSkills = (skills.skills || [])
        .filter((s) => (activeFilter === "Everything" ? true : s.includes(activeFilter)))
        .filter((s) => s.toLowerCase().includes(searchText.toLowerCase()));


    const updatePersistentEdgeControlPoints = useCallback(
        (edgeId, controlPoints, edgeKind = "transition") => {
            const setter =
                edgeKind === "slot" ? setSlotEdges : setEdges;

            setter((currentEdges) =>
                currentEdges.map((edge) =>
                    edge.id === edgeId
                        ? {
                            ...edge,
                            data: {
                                ...(edge.data || {}),
                                controlPoints,
                            },
                        }
                        : edge
                )
            );
        },
        [setEdges, setSlotEdges]
    );

    // While dragging, the dragged node takes precedence over pointer hover.
    // Edge hover is suppressed for the duration of the drag for the same
    // reason: whichever DOM element happens to be under the cursor must not
    // steal focus from the node being moved.
    const activeCanvasFocusNodeId = draggedEditorNodeId || hoveredEditorNodeId;
    const activeHoveredEditorEdgeId = draggedEditorNodeId
        ? null
        : hoveredEditorEdgeId;

    const selectedTransitionNodeIds = new Set([
        ...selectedNodes.map((node) => node.id),
        ...(selectedNodeId ? [selectedNodeId] : []),
        ...(activeCanvasFocusNodeId ? [activeCanvasFocusNodeId] : []),
    ]);

    const normalizedTransitionEdges = useMemo(
        () =>
            edges.map((edge) => {
                if (edge.targetHandle) {
                    return edge;
                }

                const targetNode = nodes.find(
                    (node) => node.id === edge.target
                );

                if (!targetNode) {
                    return edge;
                }

                // Containers use their own dedicated target handles.
                if (
                    targetNode.type === "compound" ||
                    targetNode.type === "parallel" ||
                    targetNode.type === "parallelLane"
                ) {
                    return edge;
                }

                return {
                    ...edge,
                    targetHandle: "transition-target",
                };
            }),
        [edges, nodes]
    );

    const highlightedTransitionEdges = highlightSelectedTransitions(
        withSmartTransitionRouting(normalizedTransitionEdges).map((edge) => ({
            ...edge,
            data: {
                ...(edge.data || {}),
                onControlPointsChange: (controlPoints) =>
                    updatePersistentEdgeControlPoints(
                        edge.id,
                        controlPoints,
                        "transition"
                    ),
            },
        })),
        selectedTransitionNodeIds
    );

    // Hovering a supported node directly in the editor acts like a temporary
    // selection for connection highlighting. Slot Details hover is different:
    // it previews only the exact connection from the hovered skill to the
    // currently selected slot.
    const selectedSlotContextId = activeCanvasFocusNodeId || selectedNodeId;
    const hasSelectedSlotContext = Boolean(
        selectedSlotContextId &&
        (
            nodes.some((node) => node.id === selectedSlotContextId) ||
            slotNodes.some((node) => node.id === selectedSlotContextId)
        )
    );
    const isSlotDetailsConnectionPreview = Boolean(
        hoveredSlotAccessNodeId &&
        selectedNodeId &&
        slotNodes.some((node) => node.id === selectedNodeId)
    );

    const SLOT_EDGE_INACTIVE_COLOR = "#64748b";

    const editableSlotEdges = slotEdges.map((edge) => {
        const access =
            edge.data?.access === "write" ? "write" : "read";
        const semanticColor = SLOT_CONNECTION_COLORS[access];

        const skillNodeId = edge.data?.skillNodeId || edge.source;
        const slotNodeId = edge.data?.slotNodeId || edge.target;
        const isHoveredSlotDetailsConnection =
            isSlotDetailsConnectionPreview &&
            (
                skillNodeId === hoveredSlotAccessNodeId ||
                edge.source === hoveredSlotAccessNodeId ||
                edge.target === hoveredSlotAccessNodeId
            ) &&
            (
                slotNodeId === selectedNodeId ||
                edge.source === selectedNodeId ||
                edge.target === selectedNodeId
            );

        const isConnectedToSelection = isSlotDetailsConnectionPreview
            ? isHoveredSlotDetailsConnection
            : (
                !hasSelectedSlotContext ||
                skillNodeId === selectedSlotContextId ||
                slotNodeId === selectedSlotContextId ||
                edge.source === selectedSlotContextId ||
                edge.target === selectedSlotContextId
            );

        const color = isConnectedToSelection
            ? semanticColor
            : SLOT_EDGE_INACTIVE_COLOR;

        return {
            ...edge,
            type: "smartTransition",
            // Slot edge colours are display-only. A canvas skill hover mirrors
            // selection. A Slot Details hover highlights only the exact edge
            // between that skill and the selected slot.
            style: {
                ...(edge.style || {}),
                stroke: color,
                strokeWidth: isHoveredSlotDetailsConnection
                    ? 3
                    : isConnectedToSelection
                        ? edge.style?.strokeWidth || 1.7
                        : 1.35,
                strokeDasharray: edge.style?.strokeDasharray || "5 5",
                opacity: isConnectedToSelection ? 1 : 0.3,
            },
            markerEnd: {
                ...(edge.markerEnd || {}),
                type: edge.markerEnd?.type || MarkerType.ArrowClosed,
                color,
            },
            data: {
                ...(edge.data || {}),
                access,
                onControlPointsChange: (controlPoints) =>
                    updatePersistentEdgeControlPoints(
                        edge.id,
                        controlPoints,
                        "slot"
                    ),
            },
        };
    });

    const compoundInitialEdges = nodes
        .filter(
            (node) => node.type === "compound" && !node.data?.isCollapsed
        )
        .map((compound) => {
            const initialChild = nodes.find(
                (node) =>
                    node.parentId === compound.id &&
                    (
                        node.id === compound.data?.initialChildId ||
                        (
                            !compound.data?.initialChildId &&
                            node.data?.isInitial
                        )
                    )
            );

            if (!initialChild) {
                return null;
            }

            const initialTargetHandle =
                initialChild.type === "parallel"
                    ? "target"
                    : initialChild.type === "compound"
                        ? "compound-entry"
                        : "transition-target";

            return {
                id: `edge-compound-initial-${compound.id}-${initialChild.id}`,
                source: compound.id,
                target: initialChild.id,
                sourceHandle: "compound-entry",
                targetHandle: initialTargetHandle,
                label: "",
                // The entry point is visually on the compound's left border,
                // but this helper edge should travel directly inward to the
                // initial child instead of first routing outside the compound.
                type: "straight",
                selectable: false,
                focusable: false,
                deletable: false,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: "#111827",
                },
                style: {
                    stroke: "#111827",
                    strokeWidth: 1.6,
                },
                data: {
                    compoundInitialEdge: true,
                    displayOnly: true,
                },
            };
        })
        .filter(Boolean);

    // A parallel state starts one initial state per lane. This mirrors the
    // compound-state entry helper, except that a parallel has one branch entry
    // target for every lane. If the lane contains a compound, the parallel
    // enters that compound and the compound's own initial edge continues to its
    // initial child. These edges are display-only and are never persisted as
    // normal SCXML transitions.
    const parallelEntryEdges = nodes
        .filter((node) => node.type === "parallel" && !node.data?.isCollapsed)
        .flatMap((parallel) => {
            const lanes = nodes.filter(
                (node) =>
                    node.type === "parallelLane" &&
                    node.parentId === parallel.id
            );

            return lanes
                .map((lane) => {
                    const directChildren = nodes.filter(
                        (node) => node.parentId === lane.id
                    );

                    const candidates = directChildren.filter(
                        (node) =>
                            node.type !== "slot" &&
                            node.type !== "parallelLane"
                    );

                    if (candidates.length === 0) {
                        return null;
                    }

                    const sortedCandidates = [...candidates].sort((a, b) => {
                        const ax = Number(a.position?.x || 0);
                        const bx = Number(b.position?.x || 0);
                        if (ax !== bx) return ax - bx;

                        const ay = Number(a.position?.y || 0);
                        const by = Number(b.position?.y || 0);
                        return ay - by;
                    });

                    // A compound is itself the branch entry target. Its normal
                    // compound-entry edge then selects the initial child.
                    const target =
                        candidates.find(isAutoParallelLaneCompound) ||
                        candidates.find((node) => node.data?.isInitial) ||
                        sortedCandidates[0];

                    const targetHandle =
                        target.type === "compound"
                            ? "compound-entry"
                            : target.type === "parallel"
                                ? "target"
                                : "transition-target";

                    return {
                        id: `edge-parallel-entry-${parallel.id}-${lane.id}-${target.id}`,
                        // Each lane owns an entry point on its left border. Since
                        // the lane spans the full parallel width, this point lies
                        // directly on the parallel state's left edge. A lane with
                        // one skill therefore gets the same visual entry arrow as
                        // an initial child inside a normal compound.
                        source: lane.id,
                        target: target.id,
                        sourceHandle: "parallel-entry",
                        targetHandle,
                        label: "",
                        type: "straight",
                        selectable: false,
                        focusable: false,
                        deletable: false,
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: "#0284c7",
                        },
                        style: {
                            stroke: "#0284c7",
                            strokeWidth: 1.5,
                        },
                        data: {
                            parallelEntryEdge: true,
                            parallelLaneId: lane.id,
                            displayOnly: true,
                        },
                    };
                })
                .filter(Boolean);
        });

    let visibleNodes = injectedNodes;
    let visibleEdges = [
        ...highlightedTransitionEdges,
        ...compoundInitialEdges,
        ...parallelEntryEdges,
    ];
    if (activeMode === "slots") {
        visibleNodes = [...injectedNodes, ...injectedSlotNodes];

        // Transition edges are normally hidden in Slots mode. Hovering a
        // transition-capable node directly on the canvas temporarily reveals
        // that node's transitions with the same semantic highlighting as
        // selection. Slot nodes simply have no matching transition edges.
        const hoveredTransitionEdges = activeCanvasFocusNodeId
            ? highlightedTransitionEdges.filter(
                (edge) =>
                    edge.source === activeCanvasFocusNodeId ||
                    edge.target === activeCanvasFocusNodeId
            )
            : [];

        visibleEdges = [
            ...hoveredTransitionEdges,
            ...editableSlotEdges,
        ];
    } else if (activeMode === "overview") {
        visibleNodes = [...injectedNodes, ...injectedSlotNodes];
        visibleEdges = [
            ...highlightedTransitionEdges,
            ...compoundInitialEdges,
            ...parallelEntryEdges,
            ...editableSlotEdges,
        ];
    }

    if (hiddenNodeIds.size > 0) {
        visibleEdges = visibleEdges.filter(
            (edge) =>
                !hiddenNodeIds.has(edge.source) &&
                !hiddenNodeIds.has(edge.target)
        );
    }

    // Hover focus mode. Canvas hover keeps the hovered node and all of its
    // direct connections vivid. Hovering an "Accessed by" entry in Slot
    // Details focuses only that skill, the selected slot, and their exact
    // skill-to-slot connection; transitions stay dimmed in that context.
    const isSlotDetailsFocus = Boolean(
        hoveredSlotAccessNodeId &&
        selectedNodeId &&
        slotNodes.some((node) => node.id === selectedNodeId)
    );
    const hoveredEditorEdge = activeHoveredEditorEdgeId
        ? visibleEdges.find((edge) => edge.id === activeHoveredEditorEdgeId)
        : null;
    const hasHoverFocus = Boolean(
        activeCanvasFocusNodeId ||
        hoveredEditorEdge ||
        isSlotDetailsFocus
    );

    const hoverFocusNodeIds = new Set();
    if (activeCanvasFocusNodeId) {
        hoverFocusNodeIds.add(activeCanvasFocusNodeId);

        // Every endpoint of an edge that belongs to the active canvas node is
        // part of the same focus group. During a drag this stays locked to the
        // dragged node even if the pointer briefly leaves its DOM element.
        visibleEdges.forEach((edge) => {
            if (
                edge.source === activeCanvasFocusNodeId ||
                edge.target === activeCanvasFocusNodeId
            ) {
                hoverFocusNodeIds.add(edge.source);
                hoverFocusNodeIds.add(edge.target);
            }
        });
    }

    if (hoveredEditorEdge) {
        // Edge hover focuses the relationship itself and both endpoint nodes.
        // Unlike node hover, it does not pull in the endpoints' other edges.
        hoverFocusNodeIds.add(hoveredEditorEdge.source);
        hoverFocusNodeIds.add(hoveredEditorEdge.target);
    }

    if (isSlotDetailsFocus) {
        // Slot Details deliberately keeps the narrower preview requested for
        // Accessed by: the referenced skill, the selected slot and their edge.
        hoverFocusNodeIds.add(hoveredSlotAccessNodeId);
        hoverFocusNodeIds.add(selectedNodeId);
    }

    if (hasHoverFocus) {
        const HOVER_INACTIVE_EDGE_COLOR = "#94a3b8";

        visibleEdges = visibleEdges.map((edge) => {
            const isCanvasHoverConnection = Boolean(
                activeCanvasFocusNodeId &&
                (
                    edge.source === activeCanvasFocusNodeId ||
                    edge.target === activeCanvasFocusNodeId
                )
            );
            const isHoveredEditorEdge = Boolean(
                activeHoveredEditorEdgeId && edge.id === activeHoveredEditorEdgeId
            );
            const isSlotDetailsConnection = Boolean(
                isSlotDetailsFocus &&
                (
                    (
                        edge.source === hoveredSlotAccessNodeId &&
                        edge.target === selectedNodeId
                    ) ||
                    (
                        edge.target === hoveredSlotAccessNodeId &&
                        edge.source === selectedNodeId
                    )
                )
            );

            if (
                isCanvasHoverConnection ||
                isHoveredEditorEdge ||
                isSlotDetailsConnection
            ) {
                return edge;
            }

            const existingOpacity = Number(edge.style?.opacity);
            const dimmedOpacity = Number.isFinite(existingOpacity)
                ? Math.min(existingOpacity, 0.22)
                : 0.22;

            return {
                ...edge,
                animated: false,
                style: {
                    ...(edge.style || {}),
                    stroke: HOVER_INACTIVE_EDGE_COLOR,
                    opacity: dimmedOpacity,
                },
                markerEnd: edge.markerEnd
                    ? {
                        ...edge.markerEnd,
                        color: HOVER_INACTIVE_EDGE_COLOR,
                    }
                    : edge.markerEnd,
                labelStyle: {
                    ...(edge.labelStyle || {}),
                    opacity: 0.42,
                },
            };
        });
    }

    visibleNodes = visibleNodes.map((visibleNode) => {
        const isCanvasHoverHighlight =
            visibleNode.id === activeCanvasFocusNodeId;
        const isSlotDetailsSkillHoverHighlight =
            visibleNode.id === hoveredSlotAccessNodeId &&
            visibleNode.type === "custom";
        const isSlotDetailsSelectedSlot =
            isSlotDetailsFocus && visibleNode.id === selectedNodeId;
        const isHoveredEdgeEndpoint = Boolean(
            hoveredEditorEdge &&
            (
                visibleNode.id === hoveredEditorEdge.source ||
                visibleNode.id === hoveredEditorEdge.target
            )
        );
        const isConnectedHoverFocusNode =
            hasHoverFocus && hoverFocusNodeIds.has(visibleNode.id);
        const isDimmedByHoverFocus =
            hasHoverFocus &&
            !isConnectedHoverFocusNode &&
            !isCanvasHoverHighlight &&
            !isSlotDetailsSkillHoverHighlight &&
            !isSlotDetailsSelectedSlot;

        if (isDimmedByHoverFocus) {
            return {
                ...visibleNode,
                style: {
                    ...(visibleNode.style || {}),
                    opacity: 0.42,
                    filter: "grayscale(0.72)",
                    transition:
                        visibleNode.style?.transition ||
                        "opacity 120ms ease, filter 120ms ease",
                },
            };
        }

        if (
            isCanvasHoverHighlight ||
            isHoveredEdgeEndpoint ||
            isSlotDetailsSkillHoverHighlight
        ) {
            // Canvas hover mirrors the normal selected state. Hover coming
            // from Slot Details highlights only the referenced skill node;
            // its transition edges remain untouched and only the exact
            // skill-to-slot edge is previewed above.
            return {
                ...visibleNode,
                selected: true,
            };
        }

        if (visibleNode.type === "parallelLane") {
            const isLaneDropTarget =
                visibleNode.id === parallelDropTargetId;

            if (!isLaneDropTarget) {
                return visibleNode;
            }

            return {
                ...visibleNode,
                style: {
                    ...visibleNode.style,
                    outline: "3px solid #0284c7",
                    outlineOffset: "-3px",
                    backgroundColor: "rgba(2, 132, 199, 0.12)",
                    boxShadow:
                        "inset 0 0 0 2px rgba(56, 189, 248, 0.35)",
                    borderRadius: 4,
                },
                data: {
                    ...visibleNode.data,
                    isDropTarget: true,
                },
            };
        }

        if (visibleNode.type === "parallel") {
            return {
                ...visibleNode,
                data: {
                    ...visibleNode.data,
                    isDropTarget: false,
                },
            };
        }

        if (
            visibleNode.type === "compound"
        ) {
            return {
                ...visibleNode,
                data: {
                    ...visibleNode.data,
                    isDropTarget: visibleNode.id === compoundDropTargetId,
                },
            };
        }

        return visibleNode;
    });

    const createNameforSkill = (fullSkillName) => {
        const label = fullSkillName.split(".").pop();
        const count = nodes.filter((n) => n.data.label === label).length;
        return `${fullSkillName}#${count + 1}`;
    };

    const getPackageSkillEvent = (pkgName) => {
        if (!pkgName) return [];
        return (skills.skills || []).filter((s) => s.includes(`skills.${pkgName}`));
    };

    const createNode = async (selectedSkill, nodeid, position) => {
        const data = (await fetchSkillData(selectedSkill)) || {};
        const baseSkillLabel =
            selectedSkill.split(".").pop() || selectedSkill;
        const isFinalSkill =
            baseSkillLabel.toLowerCase() === "end" ||
            baseSkillLabel.toLowerCase() === "fatal";

        let sharedEditorInstanceId;
        if (isFinalSkill) {
            const sharedStateId = selectedSkill.split("#")[0];
            const usedIds = new Set(
                nodes
                    .filter((node) => {
                        const candidate = normalizeSharedScxmlStateIdentity(node);
                        return getSharedScxmlStateId(candidate) === sharedStateId;
                    })
                    .map((node) => String(node.data?.editorInstanceId || "").trim())
                    .filter(Boolean)
            );

            let index = 1;
            while (usedIds.has(String(index))) index += 1;
            sharedEditorInstanceId = String(index);
        }

        return {
            id: nodeid,
            position,
            type: "custom",
            data: {
                label: baseSkillLabel,
                fullSkillName: isFinalSkill
                    ? selectedSkill.split("#")[0]
                    : createNameforSkill(selectedSkill),
                ...(isFinalSkill
                    ? {
                        scxmlStateId: selectedSkill.split("#")[0],
                        editorInstanceId: sharedEditorInstanceId,
                    }
                    : {}),
                description: data.description || "",
                isInitial: false,
                isFinal: isFinalSkill,
                src: "",
                onEntry: [],
                onExit: [],
                events: [
                    ...(data.events || []).map((e) => ({
                        id: e.event,
                        description: e.description || "",
                        selectedPackage: "",
                        selectedSkill: "",
                        target: null,
                        cond: "",
                        assignments: [],
                        assignLocation: "",
                        assignExpr: "",
                    })),

                    ...(selectedSkill.split(".").pop() !== "End" &&
                    selectedSkill.split(".").pop() !== "Fatal"
                        ? [
                            {
                                id: "fatal",
                                selectedPackage: "",
                                selectedSkill: "",
                                target: null,
                                cond: "",
                                assignments: [],
                                assignLocation: "",
                                assignExpr: "",
                            },
                        ]
                        : []),

                    ...(selectedSkill.split(".").pop() !== "End" &&
                    selectedSkill.split(".").pop() !== "Fatal"
                        ? [
                            {
                                id: "*",
                                selectedPackage: "",
                                selectedSkill: "",
                                target: null,
                                cond: "",
                                assignments: [],
                                assignLocation: "",
                                assignExpr: "",
                            },
                        ]
                        : []),
                ],

                sensors: data.sensors || [],
                actuators: data.actuator || data.actuators || [],

                inSlots: (data.inSlots || []).map((s) => ({
                    key: s.key,
                    type: s.type,
                    description: s.description || "",
                    path: "",
                    inherited: null,
                })),

                outSlots: (data.outSlots || []).map((s) => ({
                    key: s.key,
                    type: s.type,
                    description: s.description || "",
                    path: "",
                    inherited: null,
                })),

                params: (data.params || []).map((p) => ({
                    key: p.key,
                    type: p.type,
                    required: p.required,
                    default: p.default,
                    description: p.description || "",
                })),
            },
        };
    };

    const handleNodesChange = (changes) => {
        onNodesChange(changes);
        onSlotNodesChange(changes);
    };

    const handleVisibleEdgesChange = useCallback(
        (changes) => {
            const slotEdgeIds = new Set(
                (slotEdges || []).map((edge) => edge.id)
            );

            const slotChanges = changes.filter((change) =>
                slotEdgeIds.has(change.id)
            );
            const transitionChanges = changes.filter(
                (change) => !slotEdgeIds.has(change.id)
            );

            if (transitionChanges.length > 0) {
                onEdgesChange(transitionChanges);
            }

            if (slotChanges.length === 0) {
                return;
            }

            const removedIds = new Set(
                slotChanges
                    .filter((change) => change.type === "remove")
                    .map((change) => change.id)
            );

            if (removedIds.size > 0) {
                const removedEdges = (slotEdges || []).filter((edge) =>
                    removedIds.has(edge.id)
                );

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        let nextNode = node;

                        removedEdges.forEach((edge) => {
                            const access = edge.data?.access;
                            const slotIndex = Number(edge.data?.slotIndex);

                            if (
                                access === "read" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.inSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        inSlots: nextNode.data.inSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }

                            if (
                                access === "write" &&
                                (edge.data?.skillNodeId || edge.source) === node.id &&
                                Number.isInteger(slotIndex) &&
                                node.data?.outSlots?.[slotIndex]
                            ) {
                                nextNode = {
                                    ...nextNode,
                                    data: {
                                        ...nextNode.data,
                                        outSlots: nextNode.data.outSlots.map(
                                            (slot, index) =>
                                                index === slotIndex
                                                    ? { ...slot, path: "", inherited: null }
                                                    : slot
                                        ),
                                    },
                                };
                            }
                        });

                        return nextNode;
                    })
                );
            }

            onSlotEdgesChange(slotChanges);
        },
        [
            slotEdges,
            onEdgesChange,
            onSlotEdgesChange,
            setNodes,
        ]
    );

    const openConditionDrawer = (sourceId, sourceHandle = "", initialTargetId = null, customEdges = null) => {
        const sourceNode = nodes.find((node) => node.id === sourceId);
        if (!sourceNode) return;

        const currentEdges = customEdges || edges;
        const outgoingEdges = currentEdges.filter((edge) => edge.source === sourceId);
        const sourceEvents = sourceNode.data.events || [];

        // Edges preserve the SCXML transition order, so they are the primary
        // source for the ordered transition list shown in step 1.
        const transitions = outgoingEdges.map((edge) => {
            const matchingEvent = sourceEvents.find(
                (event) =>
                    event.id === edge.sourceHandle &&
                    event.target === edge.target &&
                    String(event.cond || "") === String(edge.data?.cond || "")
            ) || sourceEvents.find(
                (event) =>
                    event.id === edge.sourceHandle &&
                    event.target === edge.target
            );

            const targetNode = nodes.find((node) => node.id === edge.target);

            return {
                transitionId: edge.id,
                edgeId: edge.id,
                event: edge.sourceHandle || matchingEvent?.id || edge.label || "success",
                target: edge.target,
                targetLabel:
                    targetNode?.data?.label ||
                    matchingEvent?.targetLabel ||
                    edge.target,
                cond: edge.data?.cond || matchingEvent?.cond || "",
                assignments: getStoredTransitionAssignments(
                    edge.data,
                    matchingEvent
                ),
            };
        });

        // Keep transition data that may exist on the node even when an edge is
        // currently missing, without collapsing duplicate conditional paths.
        const representedCounts = new Map();
        transitions.forEach((transition) => {
            const key = `${transition.event}::${transition.target}`;
            representedCounts.set(key, (representedCounts.get(key) || 0) + 1);
        });

        const consumedCounts = new Map();
        sourceEvents
            .filter((event) => event.target)
            .forEach((event, index) => {
                const key = `${event.id}::${event.target}`;
                const consumed = consumedCounts.get(key) || 0;
                const represented = representedCounts.get(key) || 0;

                if (consumed < represented) {
                    consumedCounts.set(key, consumed + 1);
                    return;
                }

                const targetNode = nodes.find((node) => node.id === event.target);
                transitions.push({
                    transitionId: `node-transition-${sourceId}-${index}`,
                    edgeId: null,
                    event: event.id,
                    target: event.target,
                    targetLabel: targetNode?.data?.label || event.target,
                    cond: event.cond || "",
                    assignments: getStoredTransitionAssignments(event),
                });
            });

        const eventMap = new Map();
        sourceEvents.forEach((event) => {
            if (!event?.id || eventMap.has(event.id)) return;
            eventMap.set(event.id, {
                id: event.id,
                description: event.description || "",
            });
        });
        outgoingEdges.forEach((edge) => {
            const eventId = edge.sourceHandle || edge.label;
            if (!eventId || eventMap.has(eventId)) return;
            eventMap.set(eventId, { id: eventId, description: "" });
        });

        const availableTargets = nodes
            .filter((node) =>
                canTargetAcrossStateBoundaries(sourceNode, node, nodes)
            )
            .map((node) => {
                const fullSkillName = node.data?.fullSkillName || "";
                const stateName = fullSkillName.includes("#")
                    ? fullSkillName.split("#").pop()
                    : "";
                const skillName =
                    node.data?.label ||
                    fullSkillName.split(".").pop()?.split("#")[0] ||
                    node.id;
                const displayName =
                    stateName && stateName !== skillName
                        ? `${skillName} (${stateName})`
                        : skillName;

                return {
                    id: node.id,
                    label: node.data?.label || node.id,
                    displayName,
                    skillName,
                    stateName,
                    fullSkillName,
                    packageName: getSkillPackageName(fullSkillName),
                };
            });

        const initialTransition = transitions.find(
            (transition) =>
                (!sourceHandle || transition.event === sourceHandle) &&
                (!initialTargetId || transition.target === initialTargetId)
        ) || transitions.find(
            (transition) => transition.event === sourceHandle
        ) || transitions[0];

        setDrawerData({
            isOpen: true,
            sourceNodeId: sourceId,
            sourceNodeName: sourceNode.data.label,
            sourceEventName: sourceHandle,
            initialTargetId: initialTargetId || initialTransition?.target || "",
            initialTransitionId: initialTransition?.transitionId || null,
            candidateTransitions: transitions,
            availableEvents: [...eventMap.values()],
            availableTargets,
        });
    };

    const isValidConnection = useCallback((connection) => {
        const possibleInitialCompound = nodes.find(
            (node) =>
                node.id === connection.source &&
                node.type === "compound"
        );

        // The compound entry handle is source-only and may only connect
        // inward to an immediate child. It represents the compound's
        // initial state and is never a normal transition.
        if (
            possibleInitialCompound &&
            connection.sourceHandle === "compound-entry"
        ) {
            const targetNode = nodes.find(
                (node) => node.id === connection.target
            );

            return Boolean(
                targetNode &&
                targetNode.parentId === possibleInitialCompound.id &&
                isCompoundInitialChildCandidate(targetNode)
            );
        }

        // The compound entry point is never an incoming endpoint. Loose
        // connection mode would otherwise allow another event handle to use
        // this source handle as a target.
        if (connection.targetHandle === "compound-entry") {
            return false;
        }

        const sourceSlotHandle = parseSlotConnectionHandle(
            connection.sourceHandle
        );
        const targetSlotHandle = parseSlotConnectionHandle(
            connection.targetHandle
        );

        // Slot connections require all three dimensions to match:
        // skill <-> slot node, Read/Write access, and the declared slot type.
        if (sourceSlotHandle || targetSlotHandle) {
            if (
                !sourceSlotHandle ||
                !targetSlotHandle ||
                sourceSlotHandle.access !== targetSlotHandle.access ||
                sourceSlotHandle.origin === targetSlotHandle.origin
            ) {
                return false;
            }

            const sourceIsSkill = sourceSlotHandle.origin === "skill";
            const skillHandle = sourceIsSkill
                ? sourceSlotHandle
                : targetSlotHandle;
            const skillNodeId = sourceIsSkill
                ? connection.source
                : connection.target;
            const slotNodeId = sourceIsSkill
                ? connection.target
                : connection.source;

            const skillNode = nodes.find(
                (node) => node.id === skillNodeId
            );
            const slotNode = slotNodes.find(
                (node) => node.id === slotNodeId
            );

            if (!skillNode || !slotNode) {
                return false;
            }

            const skillSlot =
                skillHandle.access === "read"
                    ? skillNode.data?.inSlots?.[skillHandle.slotIndex]
                    : skillNode.data?.outSlots?.[skillHandle.slotIndex];

            const skillType = normalizeSlotType(skillSlot?.type);
            const slotType = normalizeSlotType(slotNode.data?.slotType);

            return Boolean(
                skillType &&
                slotType &&
                skillType === slotType
            );
        }

        const sourceNode = nodes.find(
            (node) => node.id === connection.source
        );
        const targetNode = nodes.find(
            (node) => node.id === connection.target
        );

        if (
            !sourceNode ||
            !targetNode ||
            !canTargetAcrossStateBoundaries(sourceNode, targetNode, nodes)
        ) {
            return false;
        }

        // Normal transitions are strictly directional even though the canvas
        // stays in ConnectionMode.Loose for bidirectional slot wiring:
        //   event handle (right) -> transition target handle (left)
        // A left transition handle can never start an edge, and an event
        // handle can never receive one.
        const normalTransitionTargetHandles = new Set([
            "transition-target",
            "target",
        ]);

        return Boolean(
            connection.sourceHandle &&
            !normalTransitionTargetHandles.has(connection.sourceHandle) &&
            normalTransitionTargetHandles.has(connection.targetHandle)
        );
    }, [nodes, slotNodes]);

    const handleConnectStart = useCallback((_, params) => {
        const slotHandle = parseSlotConnectionHandle(params?.handleId);

        if (!slotHandle) {
            setSlotConnectionDrag(null);
            return;
        }

        let slotType = "";

        if (slotHandle.origin === "skill") {
            const skillNode = nodes.find(
                (node) => node.id === params.nodeId
            );
            const skillSlot =
                slotHandle.access === "read"
                    ? skillNode?.data?.inSlots?.[slotHandle.slotIndex]
                    : skillNode?.data?.outSlots?.[slotHandle.slotIndex];

            slotType = normalizeSlotType(skillSlot?.type);
        } else {
            const slotNode = slotNodes.find(
                (node) => node.id === params.nodeId
            );
            slotType = normalizeSlotType(slotNode?.data?.slotType);
        }

        setSlotConnectionDrag({
            active: true,
            nodeId: params.nodeId,
            handleId: params.handleId,
            origin: slotHandle.origin,
            access: slotHandle.access,
            slotType,
        });
    }, [nodes, slotNodes]);

    const handleConnectEnd = useCallback(() => {
        setSlotConnectionDrag(null);
    }, []);

    const onConnect = useCallback(
        (params) => {
            const sourceCompoundForInitial = nodes.find(
                (node) =>
                    node.id === params.source &&
                    node.type === "compound"
            );

            if (
                sourceCompoundForInitial &&
                params.sourceHandle === "compound-entry"
            ) {
                const sourceCompound = sourceCompoundForInitial;
                const targetNode = nodes.find(
                    (node) => node.id === params.target
                );

                if (
                    !targetNode ||
                    targetNode.parentId !== sourceCompound.id ||
                    !isCompoundInitialChildCandidate(targetNode)
                ) {
                    return;
                }

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (node.id === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    initialChildId: targetNode.id,
                                    // The entry connector is not an exit token/event.
                                    // Clean up stale data from older editor versions.
                                    events: (node.data?.events || []).filter(
                                        (event) =>
                                            String(event?.id || "") !==
                                            "compound-entry"
                                    ),
                                },
                            };
                        }

                        if (node.parentId === sourceCompound.id) {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    isInitial: node.id === targetNode.id,
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                    updateNodeInternals(targetNode.id);
                });

                return;
            }

            if (params.targetHandle === "compound-entry") {
                return;
            }

            const sourceSlotHandle = parseSlotConnectionHandle(
                params.sourceHandle
            );
            const targetSlotHandle = parseSlotConnectionHandle(
                params.targetHandle
            );

            if (sourceSlotHandle || targetSlotHandle) {
                if (
                    !sourceSlotHandle ||
                    !targetSlotHandle ||
                    sourceSlotHandle.access !== targetSlotHandle.access ||
                    sourceSlotHandle.origin === targetSlotHandle.origin
                ) {
                    return;
                }

                const sourceIsSkill = sourceSlotHandle.origin === "skill";
                const skillHandle = sourceIsSkill
                    ? sourceSlotHandle
                    : targetSlotHandle;
                const slotHandle = sourceIsSkill
                    ? targetSlotHandle
                    : sourceSlotHandle;
                const skillNodeId = sourceIsSkill
                    ? params.source
                    : params.target;
                const slotNodeId = sourceIsSkill
                    ? params.target
                    : params.source;

                const skillNode = nodes.find(
                    (node) => node.id === skillNodeId
                );
                const slotNode = slotNodes.find(
                    (node) => node.id === slotNodeId
                );
                const slotIndex = skillHandle.slotIndex;
                const access = skillHandle.access;
                const path = getSlotPathFromNode(slotNode);

                if (!skillNode || !slotNode || !path) {
                    return;
                }

                const skillSlot =
                    access === "read"
                        ? skillNode.data?.inSlots?.[slotIndex]
                        : skillNode.data?.outSlots?.[slotIndex];

                if (!skillSlot) {
                    return;
                }

                const skillType = normalizeSlotType(skillSlot.type);
                const slotType = normalizeSlotType(slotNode.data?.slotType);

                // Never allow a Read/Write endpoint to be connected to a slot
                // node of another datatype, even if onConnect is called
                // programmatically or React Flow's loose mode accepts a drag.
                if (
                    !skillType ||
                    !slotType ||
                    skillType !== slotType
                ) {
                    return;
                }

                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        if (node.id !== skillNodeId) return node;

                        if (access === "read") {
                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    inSlots: (node.data.inSlots || []).map(
                                        (slot, index) =>
                                            index === slotIndex
                                                ? {
                                                    ...slot,
                                                    path: `/${path}`,
                                                    inherited: slotNode.data?.inherited
                                                        ? {
                                                            state:
                                                                slotNode.data?.inheritedFrom ||
                                                                "",
                                                            xpath: `/${path}`,
                                                        }
                                                        : null,
                                                }
                                                : slot
                                    ),
                                },
                            };
                        }

                        return {
                            ...node,
                            data: {
                                ...node.data,
                                outSlots: (node.data.outSlots || []).map(
                                    (slot, index) =>
                                        index === slotIndex
                                            ? {
                                                ...slot,
                                                path: `/${path}`,
                                                inherited: slotNode.data?.inherited
                                                    ? {
                                                        state:
                                                            slotNode.data?.inheritedFrom ||
                                                            "",
                                                        xpath: `/${path}`,
                                                    }
                                                    : null,
                                            }
                                            : slot
                                ),
                            },
                        };
                    })
                );

                setSlotEdges((currentEdges) => {
                    // Every skill slot has exactly one slot edge. Reconnecting
                    // the handle replaces its previous slot connection.
                    const remainingEdges = currentEdges.filter((edge) => {
                        if (edge.data?.edgeKind !== "slot") return true;
                        if (edge.data?.access !== access) return true;

                        const storedSkillNodeId =
                            edge.data?.skillNodeId || edge.source;

                        return !(
                            storedSkillNodeId === skillNodeId &&
                            Number(edge.data?.slotIndex) === slotIndex
                        );
                    });

                    const skillHandleId =
                        access === "read"
                            ? `slot-skill-read-${slotIndex}`
                            : `slot-skill-write-${slotIndex}`;
                    const slotHandleId =
                        access === "read"
                            ? "slot-node-read"
                            : "slot-node-write";

                    // Slot connections are always drawn from the skill slot
                    // handle to the corresponding endpoint on the slot node.
                    const normalizedEdge = {
                        source: skillNodeId,
                        target: slotNodeId,
                        sourceHandle: skillHandleId,
                        targetHandle: slotHandleId,
                    };

                    return [
                        ...remainingEdges,
                        {
                            id: `edge-slot-${access}-${skillNodeId}-${slotIndex}-${crypto.randomUUID()}`,
                            ...normalizedEdge,
                            type: "smartTransition",
                            style: {
                                stroke: SLOT_CONNECTION_COLORS[access],
                                strokeWidth: 1.7,
                                strokeDasharray: "5 5",
                            },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: SLOT_CONNECTION_COLORS[access],
                            },
                            data: {
                                edgeKind: "slot",
                                access,
                                slotIndex,
                                path,
                                skillNodeId,
                                slotNodeId,
                            },
                        },
                    ];
                });

                return;
            }

            const sourceNode = nodes.find(
                (n) => n.id === params.source
            );

            const targetNode = nodes.find(
                (n) => n.id === params.target
            );

            if (!sourceNode || !targetNode) {
                return;
            }

            // Do not let a normal transition cross a compound/parallel entry
            // boundary and land directly on an interior state. The external
            // edge must terminate on the container's left entry handle first.
            if (
                !canTargetAcrossStateBoundaries(
                    sourceNode,
                    targetNode,
                    nodes
                )
            ) {
                return;
            }

            // Prüfen, ob Source / Target innerhalb einer Parallel-Lane liegen
            const sourceLane = getLaneForNode(
                sourceNode,
                nodes
            );

            const targetLane = getLaneForNode(
                targetNode,
                nodes
            );

            const leavesParallel =
                sourceLane &&
                (
                    !targetLane ||
                    targetLane.parentId !== sourceLane.parentId
                );

            const alreadyExists = edges.some((edge) => {
                const logicalSource =
                    edge.data?.compoundOriginalSource ||
                    edge.data?.parallelOriginalSource ||
                    edge.source;
                const logicalHandle =
                    edge.data?.compoundOriginalSourceHandle ||
                    edge.sourceHandle;

                return (
                    logicalSource === params.source &&
                    logicalHandle === params.sourceHandle &&
                    edge.target === params.target
                );
            });

            if (alreadyExists) {
                openConditionDrawer(params.source, params.sourceHandle, params.target);
                return;
            }

            const sourceCompound =
                getDirectCompoundForNode(
                    sourceNode,
                    nodes
                );

            const targetCompound =
                getDirectCompoundForNode(
                    targetNode,
                    nodes
                );

            const leavesCompound =
                sourceCompound &&
                (
                    !targetCompound ||
                    targetCompound.id !== sourceCompound.id
                );

            if (leavesCompound) {
                const handleId =
                    params.sourceHandle || "success";

                const baseName =
                    sourceNode.data?.label ||
                    sourceNode.data?.fullSkillName ||
                    "state";

                const exitLabel =
                    `${baseName}.${handleId}`;

                // Compound exit handles must be unique per child state.
                // Two children may both expose e.g. a "success" token.
                const compoundExitId =
                    `${params.source}-${handleId}`;

                const externalEdge = {
                    id:
                        `edge-compound-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceCompound.id,
                    target: params.target,

                    sourceHandle: compoundExitId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    type: "smartTransition",

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,
                        compoundOriginalSource: params.source,
                        compoundOriginalSourceHandle: handleId,
                        compoundExitId,
                    },
                };

                const internalEdge = {
                    id:
                        `edge-internal-compound-${params.source}-` +
                        `${handleId}-${sourceCompound.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceCompound.id,
                    sourceHandle: handleId,
                    targetHandle: `target-${compoundExitId}`,
                    type: "smoothstep",
                    selectable: false,
                    focusable: false,

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },

                    data: {
                        compoundInternalEdge: true,
                        compoundExitId,
                    },
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                setNodes((currentNodes) => {
                    const childRight = getCompoundChildrenRight(
                        sourceCompound.id,
                        currentNodes
                    );

                    return currentNodes.map((node) => {
                        if (node.id !== sourceCompound.id) {
                            return node;
                        }

                        const compoundEvents = (node.data?.events || []).filter(
                            (event) =>
                                String(event?.id || "") !== "compound-entry"
                        );

                        const alreadyExists = compoundEvents.some(
                            (event) =>
                                String(event.id) === String(compoundExitId)
                        );

                        const nextEvents = alreadyExists
                            ? compoundEvents
                            : [
                                ...compoundEvents,
                                {
                                    id: compoundExitId,
                                    name: exitLabel,
                                    rawEvent: exitLabel,
                                    target: params.target,
                                    sourceNodeId: params.source,
                                    transitionHandleId: handleId,
                                },
                            ];

                        const requiredWidth =
                            childRight +
                            COMPOUND_PADDING_X +
                            getCompoundExitGutterWidth(nextEvents);

                        return {
                            ...node,
                            style: {
                                ...node.style,
                                width: Math.max(
                                    Number(node.style?.width) || 320,
                                    requiredWidth
                                ),
                            },
                            data: {
                                ...node.data,
                                events: nextEvents,
                            },
                        };
                    });
                });

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceCompound.id);
                });

                return;
            }

            /*
             * =========================================================
             * TRANSITION VERLÄSST PARALLEL
             * =========================================================
             */
            if (leavesParallel) {
                const handleId =
                    params.sourceHandle || "success";

                /*
                 * Sichtbare äußere Transition:
                 *
                 * Nicht:
                 * State A -> State B
                 *
                 * sondern:
                 * Lane -> State B
                 *
                 * parallelOriginalSource merkt sich,
                 * welcher State eigentlich die Source ist.
                 */
                const externalEdge = {
                    id:
                        `edge-${params.source}-` +
                        `${handleId}-${params.target}-` +
                        crypto.randomUUID(),

                    source: sourceLane.id,
                    target: params.target,

                    sourceHandle: handleId,
                    targetHandle: params.targetHandle,

                    label: handleId,

                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },

                    data: {
                        cond: "",
                        assignments: [],
                        assign: null,

                        // Der tatsächliche State bleibt hier gespeichert
                        parallelOriginalSource:
                        params.source,
                    },
                };

                /*
                 * Interne gestrichelte Verbindung:
                 *
                 * State A -> Lane-Rand
                 */
                const internalEdge = {
                    id:
                        `edge-internal-${params.source}-` +
                        `${handleId}-${sourceLane.id}-` +
                        crypto.randomUUID(),

                    source: params.source,
                    target: sourceLane.id,

                    sourceHandle: handleId,
                    targetHandle: `target-${handleId}`,

                    type: "smoothstep",

                    style: {
                        strokeDasharray: "4 4",
                        stroke: "#0284c7",
                        strokeWidth: 1.5,
                    },
                };

                setEdges((currentEdges) => [
                    ...currentEdges,
                    externalEdge,
                    internalEdge,
                ]);

                /*
                 * Die Lane braucht den Event/Handle ebenfalls,
                 * damit die äußere Transition sauber am Rand
                 * angezeigt werden kann.
                 */
                setNodes((currentNodes) =>
                    currentNodes.map((node) => {
                        /*
                         * Event am ursprünglichen State ergänzen
                         */
                        if (node.id === params.source) {
                            const events =
                                node.data?.events || [];

                            const existingEvent =
                                events.find(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (existingEvent) {
                                return node;
                            }

                            return {
                                ...node,
                                data: {
                                    ...node.data,
                                    events: [
                                        ...events,
                                        {
                                            id: handleId,

                                            selectedPackage:
                                                getSkillPackageName(
                                                    targetNode
                                                        ?.data
                                                        ?.fullSkillName
                                                ),

                                            selectedSkill:
                                                targetNode
                                                    ?.data
                                                    ?.fullSkillName
                                                    ?.split("#")[0] ||
                                                "",

                                            target:
                                            params.target,

                                            cond: "",

                                            assignments: [],

                                            assignLocation: "",
                                            assignExpr: "",
                                        },
                                    ],
                                },
                            };
                        }

                        /*
                         * Passenden Handle/Event an der Lane erzeugen
                         */
                        if (node.id === sourceLane.id) {
                            const laneEvents =
                                node.data?.events || [];

                            const alreadyHasEvent =
                                laneEvents.some(
                                    (event) =>
                                        event.id === handleId
                                );

                            if (alreadyHasEvent) {
                                return node;
                            }

                            const baseName =
                                sourceNode.data?.label ||
                                sourceNode.data
                                    ?.fullSkillName ||
                                "state";

                            return {
                                ...node,
                                data: {
                                    ...node.data,

                                    events: [
                                        ...laneEvents,
                                        {
                                            id: handleId,

                                            name:
                                                `${baseName}.` +
                                                handleId,

                                            rawEvent:
                                                `${baseName}.` +
                                                handleId,

                                            target:
                                            params.target,
                                        },
                                    ],
                                },
                            };
                        }

                        return node;
                    })
                );

                requestAnimationFrame(() => {
                    updateNodeInternals(sourceLane.id);
                });

                /*
                 * Falls mehrere Transitions vom selben Event ausgehen,
                 * Condition Drawer öffnen.
                 */
                const outgoingFromHandle = [
                    ...edges,
                    externalEdge,
                ].filter((edge) => {
                    const logicalSource =
                        edge.data?.parallelOriginalSource ||
                        edge.source;

                    return (
                        logicalSource === params.source &&
                        edge.sourceHandle === handleId
                    );
                });

                if (outgoingFromHandle.length >= 2) {
                    openConditionDrawer(
                        params.source,
                        handleId,
                        params.target,
                        [
                            ...edges,
                            externalEdge,
                            internalEdge,
                        ]
                    );
                }

                return;
            }

            /*
             * =========================================================
             * NORMALE TRANSITION
             * =========================================================
             *
             * Source liegt nicht im Parallel oder Target befindet
             * sich im selben Parallel-State.
             */
            const newEdge = {
                id:
                    `edge-${params.source}-` +
                    `${params.sourceHandle}-` +
                    `${params.target}-` +
                    crypto.randomUUID(),

                source: params.source,
                target: params.target,

                sourceHandle:
                params.sourceHandle,

                targetHandle:
                params.targetHandle,

                label:
                params.sourceHandle,

                type: "smartTransition",
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                },

                data: {
                    cond: "",
                    assignments: [],
                    assign: null,
                },
            };

            const updatedEdges = [
                ...edges,
                newEdge,
            ];

            setEdges(updatedEdges);

            /*
             * Event am Source-State aktualisieren
             */
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    if (node.id !== params.source) {
                        return node;
                    }

                    const events =
                        node.data?.events || [];

                    const existingEvent =
                        events.find(
                            (event) =>
                                event.id ===
                                params.sourceHandle
                        );

                    if (existingEvent) {
                        return node;
                    }

                    return {
                        ...node,
                        data: {
                            ...node.data,

                            events: [
                                ...events,
                                {
                                    id:
                                    params.sourceHandle,

                                    selectedPackage:
                                        getSkillPackageName(
                                            targetNode
                                                ?.data
                                                ?.fullSkillName
                                        ),

                                    selectedSkill:
                                        targetNode
                                            ?.data
                                            ?.fullSkillName
                                            ?.split("#")[0] ||
                                        "",

                                    target:
                                    params.target,

                                    cond: "",
                                    assignments: [],
                                    assignLocation: "",
                                    assignExpr: "",
                                },
                            ],
                        },
                    };
                })
            );

            const outgoingFromHandle =
                updatedEdges.filter(
                    (edge) =>
                        edge.source ===
                        params.source &&
                        edge.sourceHandle ===
                        params.sourceHandle
                );

            if (outgoingFromHandle.length >= 2) {
                openConditionDrawer(
                    params.source,
                    params.sourceHandle,
                    params.target,
                    updatedEdges
                );
            }
        },
        [
            edges,
            nodes,
            slotNodes,
            setEdges,
            setNodes,
            setSlotEdges,
            updateNodeInternals,
        ]
    );

    const clearTransitionSelection = useCallback(() => {
        setEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...clearTransientTransitionHighlight(edge),
                selected: false,
            }))
        );
    }, [setEdges]);

    const clearSlotEdgeSelection = useCallback(() => {
        setSlotEdges((currentEdges) =>
            currentEdges.map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
    }, [setSlotEdges]);

    const clearAllEdgeSelection = useCallback(() => {
        clearTransitionSelection();
        clearSlotEdgeSelection();
    }, [clearTransitionSelection, clearSlotEdgeSelection]);

    const selectTransitionEdge = useCallback(
        (edgeId) => {
            // Edge and node selection are mutually exclusive. A previously
            // selected skill would otherwise keep all of its connected
            // transitions highlighted in addition to the explicitly selected
            // transition.
            setSelectedNodeId(null);
            setNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.selected
                        ? { ...node, selected: false }
                        : node
                )
            );
            setSlotNodes((currentNodes) =>
                currentNodes.map((node) =>
                    node.selected
                        ? { ...node, selected: false }
                        : node
                )
            );

            clearSlotEdgeSelection();
            setEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...clearTransientTransitionHighlight(edge),
                    selected: edge.id === edgeId,
                }))
            );
        },
        [
            setEdges,
            setNodes,
            setSlotNodes,
            clearSlotEdgeSelection,
        ]
    );

    const selectSlotEdge = useCallback(
        (edgeId) => {
            clearTransitionSelection();
            setSlotEdges((currentEdges) =>
                currentEdges.map((edge) => ({
                    ...edge,
                    selected: edge.id === edgeId,
                }))
            );
        },
        [setSlotEdges, clearTransitionSelection]
    );

    const onEdgeDoubleClick = useCallback(
        (event, edge) => {
            selectTransitionEdge(edge.id);
            openConditionDrawer(edge.source, edge.sourceHandle, edge.target);
        },
        [edges, nodes, selectTransitionEdge]
    );

    const handleConfirmDrawer = ({ updatedTransitions, newGlobalVars = [], newGlobalVar = null }) => {
        const varsToAdd = [
            ...(Array.isArray(newGlobalVars) ? newGlobalVars : []),
            ...(newGlobalVar ? [newGlobalVar] : []),
        ];

        if (varsToAdd.length > 0) {
            setGlobalDataModel((previous) => {
                const existingIds = new Set(previous.map((variable) => variable.id));
                const additions = varsToAdd.filter(
                    (variable) => variable?.id && !existingIds.has(variable.id)
                );
                return [...previous, ...additions];
            });
        }

        const sourceId = drawerData.sourceNodeId;
        if (!sourceId || !Array.isArray(updatedTransitions)) return;

        const sourceNode = nodes.find((node) => node.id === sourceId);
        if (!sourceNode) return;

        const validUpdatedTransitions = updatedTransitions.filter((transition) => {
            const targetNode = nodes.find(
                (node) => node.id === transition.target
            );

            return Boolean(
                targetNode &&
                canTargetAcrossStateBoundaries(sourceNode, targetNode, nodes)
            );
        });

        // Rebuild this state's edges in exactly the order selected in step 1.
        setEdges((currentEdges) => {
            const untouchedEdges = currentEdges.filter(
                (edge) => edge.source !== sourceId
            );
            const existingById = new Map(
                currentEdges.map((edge) => [edge.id, edge])
            );

            const rebuiltEdges = validUpdatedTransitions.map((transition) => {
                const existing = transition.edgeId
                    ? existingById.get(transition.edgeId)
                    : null;
                const eventId = transition.event || "success";
                const hasCondition = Boolean(
                    transition.cond && transition.cond.trim()
                );

                const cleanedExisting = existing
                    ? clearTransientTransitionHighlight(existing)
                    : null;

                return {
                    ...(cleanedExisting || {}),
                    id:
                        cleanedExisting?.id ||
                        `edge-${sourceId}-${eventId}-${transition.target}-${crypto.randomUUID()}`,
                    source: sourceId,
                    target: transition.target,
                    sourceHandle: eventId,
                    targetHandle:
                        getTransitionTargetHandleForNode(
                            nodes.find((node) => node.id === transition.target)
                        ),
                    type: "smartTransition",
                    selected: false,
                    label: hasCondition
                        ? `${eventId} [${transition.cond}]`
                        : eventId,
                    markerEnd:
                        cleanedExisting?.markerEnd || { type: MarkerType.ArrowClosed },
                    data: {
                        ...(cleanedExisting?.data || {}),
                        cond: transition.cond || "",
                        assignments: Array.isArray(transition.assignments)
                            ? transition.assignments.map((assignment) => ({
                                location: assignment.location,
                                expr: assignment.expr,
                            }))
                            : [],
                        // Keep the first assignment in the legacy field for
                        // compatibility with older saved UI state.
                        assign: transition.assignments?.[0]
                            ? {
                                location: transition.assignments[0].location,
                                expr: transition.assignments[0].expr,
                            }
                            : null,
                    },
                };
            });

            return [...untouchedEdges, ...rebuiltEdges];
        });

        setNodes((currentNodes) =>
            currentNodes.map((node) => {
                if (node.id !== sourceId) return node;

                const originalEvents = node.data.events || [];
                const baseEventById = new Map();

                originalEvents.forEach((event) => {
                    if (!event?.id || baseEventById.has(event.id)) return;
                    baseEventById.set(event.id, {
                        ...event,
                        target: null,
                        cond: "",
                        assignments: [],
                        assignLocation: "",
                        assignExpr: "",
                        selectedPackage: "",
                        selectedSkill: "",
                    });
                });

                const usedEventIds = new Set();
                const orderedTransitionEvents = validUpdatedTransitions.map(
                    (transition) => {
                        usedEventIds.add(transition.event);
                        const baseEvent = baseEventById.get(transition.event) || {
                            id: transition.event,
                            description: "",
                        };
                        const targetNode = currentNodes.find(
                            (candidate) => candidate.id === transition.target
                        );

                        return {
                            ...baseEvent,
                            id: transition.event,
                            selectedPackage: getSkillPackageName(
                                targetNode?.data?.fullSkillName
                            ),
                            selectedSkill:
                                targetNode?.data?.fullSkillName?.split("#")[0] ||
                                targetNode?.data?.label ||
                                "",
                            target: transition.target,
                            cond: transition.cond || "",
                            assignments: Array.isArray(transition.assignments)
                                ? transition.assignments.map((assignment) => ({
                                    location: assignment.location,
                                    expr: assignment.expr,
                                }))
                                : [],
                            assignLocation:
                                transition.assignments?.[0]?.location || "",
                            assignExpr:
                                transition.assignments?.[0]?.expr || "",
                        };
                    }
                );

                // Exit tokens without a transition must stay available as handles
                // and as choices for creating a new transition later.
                const unusedEvents = [...baseEventById.entries()]
                    .filter(([eventId]) => !usedEventIds.has(eventId))
                    .map(([, event]) => event);

                return {
                    ...node,
                    data: {
                        ...node.data,
                        events: [...orderedTransitionEvents, ...unusedEvents],
                    },
                };
            })
        );

        setDrawerData((previous) => ({ ...previous, isOpen: false }));
    };

    const updateNodeEvent = (nodeId, eventId, changes) => {
        setNodes((nds) =>
            nds.map((n) =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, events: n.data.events.map((e) => (e.id === eventId ? { ...e, ...changes } : e)) } }
                    : n
            )
        );
    };

    const setExistingTargetForEvent = (event, targetNodeId) => {
        if (!selectedNode || !targetNodeId) return;

        const targetNode = nodes.find((node) => node.id === targetNodeId);
        if (
            !targetNode ||
            !canTargetAcrossStateBoundaries(
                selectedNode,
                targetNode,
                nodes
            )
        ) {
            return;
        }

        setEdges((currentEdges) => {
            const withoutPreviousDirectTarget = currentEdges.filter((edge) => {
                if (
                    edge.source !== selectedNode.id ||
                    edge.sourceHandle !== event.id
                ) {
                    return true;
                }

                if (!event.target) {
                    return true;
                }

                return edge.target !== event.target;
            });

            const alreadyExists = withoutPreviousDirectTarget.some(
                (edge) =>
                    edge.source === selectedNode.id &&
                    edge.sourceHandle === event.id &&
                    edge.target === targetNodeId
            );

            if (alreadyExists) {
                return withoutPreviousDirectTarget;
            }

            return addEdge(
                {
                    id: `edge-${selectedNode.id}-${event.id}-${targetNodeId}-${crypto.randomUUID()}`,
                    source: selectedNode.id,
                    target: targetNodeId,
                    sourceHandle: event.id,
                    targetHandle: getTransitionTargetHandleForNode(targetNode),
                    label: event.id,
                    type: "smartTransition",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    data: { cond: "", assignments: [], assign: null },
                },
                withoutPreviousDirectTarget
            );
        });

        updateNodeEvent(selectedNode.id, event.id, {
            selectedPackage: getSkillPackageName(
                targetNode.data?.fullSkillName
            ),
            selectedSkill:
                targetNode.data?.fullSkillName?.split("#")[0] ||
                targetNode.data?.label ||
                "",
            target: targetNodeId,
        });
    };

    const checkSlotConnection = (customNodes = null, customManualSlots = null) => {
        const targetNodes = Array.isArray(customNodes) ? customNodes : nodes;
        const activeManualSlots =
            customManualSlots !== null ? customManualSlots : manualSlots;
        if (!targetNodes || targetNodes.length === 0) {
            setSlotNodes([]);
            setSlotEdges([]);
            return;
        }

        const usedPaths = new Map();

        // The current machine's inheritance status must come from the current
        // SCXML's own #_SLOTS declarations. Child-machine inheritSlot metadata
        // must never make a normal parent <slot> look like an <inheritSlot>.
        const currentMachineDeclarations = new Map();
        (activeManualSlots || []).forEach((slot) => {
            const cleanPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (!cleanPath) return;

            const existing = currentMachineDeclarations.get(cleanPath) || {
                declared: false,
                inherited: null,
            };
            const isInheritedDeclaration =
                slot?.slotKind === "inheritSlot" || Boolean(slot?.inherited);

            currentMachineDeclarations.set(cleanPath, {
                declared: true,
                inherited:
                    existing.inherited ||
                    (isInheritedDeclaration
                        ? slot?.inherited || {
                        state: slot?.state || "",
                        xpath: `/${cleanPath}`,
                    }
                        : null),
            });
        });

        const registerSlotUsage = (s, options = {}) => {
            if (!s.path || !s.path.trim()) return;
            const cleanPath = normalizeSlotPath(s.path);
            const existing = usedPaths.get(cleanPath) || {};
            const requiredByChildren = [
                ...(existing.requiredByChildren || []),
            ];

            if (options.requiredByChild) {
                const requirement = options.requiredByChild;
                const duplicate = requiredByChildren.some(
                    (entry) =>
                        entry?.childNodeId === requirement.childNodeId &&
                        entry?.access === requirement.access
                );

                if (!duplicate) {
                    requiredByChildren.push(requirement);
                }
            }

            const declaration = currentMachineDeclarations.get(cleanPath);
            let currentMachineInherited =
                existing.currentMachineInherited || null;

            if (!options.requiredByChild) {
                if (declaration?.declared) {
                    // Explicit current-machine declarations are authoritative.
                    // A normal <slot> therefore stays normal even if a child
                    // machine has an <inheritSlot> with the same xpath.
                    currentMachineInherited = declaration.inherited || null;
                } else if (!currentMachineInherited && s.inherited) {
                    // Backwards compatibility for editor-created/legacy slots
                    // which may not yet have a separate declaration entry.
                    currentMachineInherited = s.inherited;
                }
            }

            usedPaths.set(cleanPath, {
                type: s.type || existing.type || "Unknown",
                // Keep the two inheritance directions independent:
                // - currentMachineInherited: this workflow itself declares the
                //   path as <inheritSlot> and receives it from its own parent.
                // - requiredByChildren: one or more sourced child state machines
                //   declare the same path as <inheritSlot>.
                // A path may legitimately have BOTH properties at the same time.
                currentMachineInherited,
                // Keep the legacy field for older code / persisted state.
                inherited: currentMachineInherited,
                requiredByChildren,
            });
        };

        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach(registerSlotUsage);
            (node.data.outSlots || []).forEach(registerSlotUsage);

            if (node.type === "submachine") {
                (node.data.inheritedSlots || []).forEach((slot) => {
                    registerSlotUsage(
                        {
                            path: slot.path,
                            type: slot.type || "Unknown",
                        },
                        {
                            requiredByChild: {
                                childNodeId: node.id,
                                childLabel:
                                    node.data?.label ||
                                    node.data?.fullSkillName ||
                                    "Sub-state machine",
                                access: slot.access || "inherit",
                            },
                        }
                    );
                });
            }
        });

        (activeManualSlots || []).forEach(registerSlotUsage);

        const generatedSlotNodes = [];
        let index = 0;

        // New slot nodes should appear underneath the workflow instead of
        // being mixed into the skill/state area. Keep positions of slots the
        // user has already moved, but derive the initial row for new slots
        // from the current workflow bounds.
        const slotLayoutNodes = targetNodes.filter(
            (node) => node.type !== "parallelLane"
        );
        const slotLayoutBounds = slotLayoutNodes.reduce(
            (bounds, node) => {
                const absolutePosition = getAbsoluteNodePosition(
                    node,
                    targetNodes
                );
                const size = getNodeSize(node);

                return {
                    minX: Math.min(bounds.minX, absolutePosition.x),
                    maxBottom: Math.max(
                        bounds.maxBottom,
                        absolutePosition.y + size.height
                    ),
                };
            },
            { minX: Infinity, maxBottom: -Infinity }
        );
        const slotSpawnX = Number.isFinite(slotLayoutBounds.minX)
            ? slotLayoutBounds.minX
            : 380;
        const slotSpawnY = Number.isFinite(slotLayoutBounds.maxBottom)
            ? slotLayoutBounds.maxBottom + 100
            : 120;

        usedPaths.forEach(
            ({
                 type,
                 inherited,
                 currentMachineInherited,
                 requiredByChildren = [],
             }, path) => {
                const slotNodeId = `slot-${path}`;
                const existingSlotNode = slotNodes.find(
                    (node) => node.id === slotNodeId
                );

                generatedSlotNodes.push({
                    id: slotNodeId,
                    position:
                        existingSlotNode?.position || {
                            x: slotSpawnX + (index % 3) * 220,
                            y: slotSpawnY + Math.floor(index / 3) * 140,
                        },
                    type: "slot",
                    data: {
                        path: `/${path}`,
                        label: `/${path}`,
                        slotType: type,
                        currentMachineInherited: Boolean(
                            currentMachineInherited || inherited
                        ),
                        inherited: Boolean(currentMachineInherited || inherited),
                        slotKind:
                            currentMachineInherited || inherited
                                ? "inheritSlot"
                                : undefined,
                        inheritedFrom:
                            (currentMachineInherited || inherited)?.state || "",
                        requiredByChild: requiredByChildren.length > 0,
                        requiredByChildren,
                    },
                });

                index++;
            }
        );

        setSlotNodes(generatedSlotNodes);

        const newSlotEdges = [];
        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((inslot, inIndex) => {
                if (inslot.path && inslot.path.trim() !== "") {
                    const cleanPath = inslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    const existingReadEdge = (slotEdges || []).find(
                        (edge) =>
                            edge.data?.edgeKind === "slot" &&
                            edge.data?.access === "read" &&
                            (edge.data?.skillNodeId || edge.source) === node.id &&
                            Number(edge.data?.slotIndex) === inIndex
                    );

                    newSlotEdges.push({
                        id:
                            existingReadEdge?.id ||
                            `edge-read-${slotNodeId}-${node.id}-${inIndex}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: `slot-skill-read-${inIndex}`,
                        targetHandle: "slot-node-read",
                        type: "smartTransition",
                        selected: Boolean(existingReadEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS.read,
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS.read,
                        },
                        data: {
                            edgeKind: "slot",
                            access: "read",
                            slotIndex: inIndex,
                            path: cleanPath,
                            skillNodeId: node.id,
                            slotNodeId,
                            controlPoints:
                                existingReadEdge?.data?.controlPoints || [],
                        },
                    });
                }
            });

            (node.data.outSlots || []).forEach((outslot, outIndex) => {
                if (outslot.path && outslot.path.trim() !== "") {
                    const cleanPath = outslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    const existingWriteEdge = (slotEdges || []).find(
                        (edge) =>
                            edge.data?.edgeKind === "slot" &&
                            edge.data?.access === "write" &&
                            (edge.data?.skillNodeId || edge.source) === node.id &&
                            Number(edge.data?.slotIndex) === outIndex
                    );

                    newSlotEdges.push({
                        id:
                            existingWriteEdge?.id ||
                            `edge-write-${node.id}-${slotNodeId}-${outIndex}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: `slot-skill-write-${outIndex}`,
                        targetHandle: "slot-node-write",
                        type: "smartTransition",
                        selected: Boolean(existingWriteEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS.write,
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS.write,
                        },
                        data: {
                            edgeKind: "slot",
                            access: "write",
                            slotIndex: outIndex,
                            path: cleanPath,
                            skillNodeId: node.id,
                            slotNodeId,
                            controlPoints:
                                existingWriteEdge?.data?.controlPoints || [],
                        },
                    });
                }
            });

            if (node.type === "submachine") {
                (node.data.inheritedSlots || []).forEach((slot, inheritIndex) => {
                    if (
                        !slot?.access ||
                        !slot?.path ||
                        !String(slot.path).trim()
                    ) {
                        return;
                    }

                    const access = slot.access;
                    const cleanPath = normalizeSlotPath(slot.path);
                    const slotNodeId = `slot-${cleanPath}`;
                    const handleId =
                        `slot-submachine-${access}-${inheritIndex}`;
                    const existingInheritedEdge = (slotEdges || []).find(
                        (edge) =>
                            edge.data?.edgeKind === "slot" &&
                            edge.data?.subMachineInherited === true &&
                            edge.data?.subMachineNodeId === node.id &&
                            edge.data?.access === access &&
                            Number(edge.data?.inheritIndex) === inheritIndex
                    );

                    newSlotEdges.push({
                        id:
                            existingInheritedEdge?.id ||
                            `edge-inherited-${access}-${node.id}-${inheritIndex}-${slotNodeId}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: handleId,
                        targetHandle:
                            access === "read"
                                ? "slot-node-read"
                                : "slot-node-write",
                        type: "smartTransition",
                        selected: Boolean(existingInheritedEdge?.selected),
                        style: {
                            stroke: SLOT_CONNECTION_COLORS[access],
                            strokeWidth: 1.7,
                            strokeDasharray: "5 5",
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: SLOT_CONNECTION_COLORS[access],
                        },
                        data: {
                            edgeKind: "slot",
                            access,
                            path: cleanPath,
                            slotNodeId,
                            subMachineInherited: true,
                            subMachineNodeId: node.id,
                            inheritIndex,
                            controlPoints:
                                existingInheritedEdge?.data?.controlPoints || [],
                        },
                    });
                });
            }
        });

        setSlotEdges(newSlotEdges);
    };

    const handleUpdateSelectedSlotPath = (nextPath) => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") return;

        const oldPath = getSlotPathFromNode(selectedRawNode);
        const newPath = normalizeSlotPath(nextPath);
        if (!oldPath || !newPath || oldPath === newPath) return;

        const formattedPath = `/${newPath}`;
        const updateSlotReference = (slot) => {
            if (normalizeSlotPath(slot?.path) !== oldPath) return slot;

            return {
                ...slot,
                path: formattedPath,
                inherited: slot?.inherited
                    ? {
                        ...slot.inherited,
                        xpath: formattedPath,
                    }
                    : slot?.inherited,
            };
        };

        const updatedNodes = nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                inSlots: (node.data?.inSlots || []).map(updateSlotReference),
                outSlots: (node.data?.outSlots || []).map(updateSlotReference),
            },
        }));

        const updatedManualSlots = (manualSlots || []).map((slot) => {
            const declarationPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (declarationPath !== oldPath) return slot;

            return {
                ...slot,
                path: formattedPath,
                inherited: slot?.inherited
                    ? {
                        ...slot.inherited,
                        xpath: formattedPath,
                    }
                    : slot?.inherited,
            };
        });

        setNodes(updatedNodes);
        setManualSlots(updatedManualSlots);
        setSelectedNodeId(`slot-${newPath}`);
        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    const handleUpdateSelectedSlotInherited = (shouldInherit) => {
        if (!selectedRawNode || selectedRawNode.type !== "slot") return;

        const path = getSlotPathFromNode(selectedRawNode);
        if (!path) return;
        const formattedPath = `/${path}`;

        const updatedNodes = nodes.map((node) => {
            const stateName =
                node.data?.fullSkillName ||
                node.data?.label ||
                node.id;

            const updateSlotReference = (slot) => {
                if (normalizeSlotPath(slot?.path) !== path) return slot;

                return {
                    ...slot,
                    inherited: shouldInherit
                        ? {
                            ...(slot?.inherited || {}),
                            state: slot?.inherited?.state || stateName,
                            xpath: formattedPath,
                        }
                        : null,
                };
            };

            return {
                ...node,
                data: {
                    ...node.data,
                    inSlots: (node.data?.inSlots || []).map(updateSlotReference),
                    outSlots: (node.data?.outSlots || []).map(updateSlotReference),
                },
            };
        });

        const updatedManualSlots = (manualSlots || []).map((slot) => {
            const declarationPath = normalizeSlotPath(
                slot?.inherited?.xpath || slot?.path
            );
            if (declarationPath !== path) return slot;

            return {
                ...slot,
                slotKind: shouldInherit ? "inheritSlot" : "slot",
                inherited: shouldInherit
                    ? {
                        ...(slot?.inherited || {}),
                        state:
                            slot?.inherited?.state ||
                            slot?.state ||
                            "",
                        xpath: formattedPath,
                    }
                    : null,
            };
        });

        setNodes(updatedNodes);
        setManualSlots(updatedManualSlots);
        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    // Graph-aware copy/paste/duplicate/select-all shortcuts. A copied
    // selection contains the selected nodes plus transitions whose source and
    // target are both in that selection. Pasting remaps graph IDs and keeps
    // the relative layout of the copied group.
    useEffect(() => {
        const isTypingTarget = (target) => {
            if (!(target instanceof Element)) return false;

            return Boolean(
                target.closest(
                    'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
                )
            );
        };

        const captureSelection = () => {
            let nodesToCopy = nodes.filter(
                (node) => node.selected && node.type !== "parallelLane"
            );

            // React Flow can clear/delay its internal `selected` flag while the
            // editor still has a node selected in the details panel. Falling
            // back to selectedNodeId keeps Ctrl+C reliable for the common
            // single-node case (including shared End/Fatal/Nop clones).
            if (nodesToCopy.length === 0 && selectedNodeId) {
                const selectedNode = nodes.find(
                    (node) =>
                        node.id === selectedNodeId &&
                        node.type !== "parallelLane"
                );

                if (selectedNode) {
                    nodesToCopy = [selectedNode];
                }
            }

            if (nodesToCopy.length === 0) return false;

            const copiedNodeIds = new Set(
                nodesToCopy.map((node) => node.id)
            );

            const copiedEdges = edges.filter(
                (edge) =>
                    copiedNodeIds.has(edge.source) &&
                    copiedNodeIds.has(edge.target)
            );

            graphClipboardRef.current = {
                nodes: nodesToCopy.map((node) =>
                    cloneGraphValue({
                        ...node,
                        selected: false,
                    })
                ),
                edges: copiedEdges.map((edge) =>
                    cloneGraphValue({
                        ...edge,
                        selected: false,
                    })
                ),
            };

            pasteSequenceRef.current = 0;
            return true;
        };

        const pasteClipboard = () => {
            const clipboard = graphClipboardRef.current;
            if (!clipboard?.nodes?.length) return false;

            pasteSequenceRef.current += 1;
            const offset = 40 * pasteSequenceRef.current;

            const idMap = new Map();
            clipboard.nodes.forEach((node) => {
                idMap.set(node.id, getNodeId());
            });

            // Avoid duplicate SCXML state instance names such as Talk#1.
            const usedFullSkillNames = new Set(
                nodes
                    .map((node) => String(node.data?.fullSkillName || ""))
                    .filter(Boolean)
            );

            const usedSharedInstanceIds = new Map();
            ensureSharedEditorInstanceIds(nodes).forEach((node) => {
                const sharedKey = getSharedScxmlStateKey(node);
                if (!sharedKey) return;
                if (!usedSharedInstanceIds.has(sharedKey)) {
                    usedSharedInstanceIds.set(sharedKey, new Set());
                }
                const instanceId = String(node.data?.editorInstanceId || "").trim();
                if (instanceId) usedSharedInstanceIds.get(sharedKey).add(instanceId);
            });

            const allocateSharedEditorInstanceId = (data) => {
                const candidateNode = normalizeSharedScxmlStateIdentity({
                    type: "custom",
                    data,
                });
                const sharedKey = getSharedScxmlStateKey(candidateNode);
                if (!sharedKey) return undefined;

                if (!usedSharedInstanceIds.has(sharedKey)) {
                    usedSharedInstanceIds.set(sharedKey, new Set());
                }

                const used = usedSharedInstanceIds.get(sharedKey);
                let index = 1;
                while (used.has(String(index))) index += 1;
                const instanceId = String(index);
                used.add(instanceId);
                return instanceId;
            };

            const allocateFullSkillName = (node, data) => {
                if (node.type !== "custom") return data;

                const current = String(data?.fullSkillName || "").trim();
                if (!current) return data;

                const base = current.split("#")[0];
                const skillName = base.split(".").pop()?.toLowerCase() || "";

                // End/Fatal copies are editor aliases, not separate SCXML
                // instances. Their unique React Flow node id is sufficient.
                if (skillName === "end" || skillName === "fatal") {
                    const normalizedData = {
                        ...data,
                        label: skillName === "end" ? "End" : "Fatal",
                        scxmlStateId: data?.scxmlStateId || base,
                        fullSkillName: base,
                        isFinal: true,
                    };

                    return {
                        ...normalizedData,
                        editorInstanceId: allocateSharedEditorInstanceId(
                            normalizedData
                        ),
                    };
                }

                // A forwarding Nop is also an editor alias when copied. Keep
                // its original SCXML state identity privately, while the visible
                // editor skill identity stays unsuffixed and its name comes from
                // the event(s) it forwards.
                if (skillName === "nop" && data?.isBehaviorExit) {
                    const sentEvents = Array.isArray(data?.behaviorExitEvents)
                        ? data.behaviorExitEvents.filter(Boolean)
                        : [];

                    const normalizedData = {
                        ...data,
                        label:
                            sentEvents.length > 0
                                ? sentEvents.join(", ")
                                : data?.label || "Nop",
                        fullSkillName: base,
                    };

                    const normalizedScxmlStateId =
                        getForwardingNopScxmlStateId(
                            { type: "custom", data: normalizedData },
                            sentEvents[0] || ""
                        );

                    normalizedData.behaviorExitScxmlStateId =
                        normalizedScxmlStateId;
                    normalizedData.scxmlStateId = normalizedScxmlStateId;

                    return {
                        ...normalizedData,
                        editorInstanceId: allocateSharedEditorInstanceId(
                            normalizedData
                        ),
                    };
                }

                // Normal skills still need a distinct SCXML state id when
                // duplicated.
                let index = 1;
                let candidate = `${base}#${index}`;

                while (usedFullSkillNames.has(candidate)) {
                    index += 1;
                    candidate = `${base}#${index}`;
                }

                usedFullSkillNames.add(candidate);
                return {
                    ...data,
                    fullSkillName: candidate,
                };
            };

            const remapEvent = (eventData) => {
                const eventCopy = cloneGraphValue(eventData);

                if (eventCopy.sourceNodeId && idMap.has(eventCopy.sourceNodeId)) {
                    eventCopy.sourceNodeId = idMap.get(eventCopy.sourceNodeId);
                }

                if (!eventCopy.target) return eventCopy;

                if (idMap.has(eventCopy.target)) {
                    eventCopy.target = idMap.get(eventCopy.target);
                    return eventCopy;
                }

                // The copied selection deliberately excludes transitions to
                // nodes outside the selection. Keep the exit token available,
                // but remove its old external transition metadata.
                return {
                    ...eventCopy,
                    target: null,
                    cond: "",
                    assignments: [],
                    assignLocation: "",
                    assignExpr: "",
                    selectedPackage: "",
                    selectedSkill: "",
                };
            };

            const pastedNodes = clipboard.nodes.map((clipboardNode) => {
                const node = cloneGraphValue(clipboardNode);
                let data = cloneGraphValue(node.data || {});

                if (Array.isArray(data.events)) {
                    data.events = data.events.map(remapEvent);
                }

                data = allocateFullSkillName(node, data);

                // A duplicate must not silently create a second initial state.
                if (data.isInitial) {
                    data.isInitial = false;
                }

                return {
                    ...node,
                    id: idMap.get(node.id),
                    parentId:
                        node.parentId && idMap.has(node.parentId)
                            ? idMap.get(node.parentId)
                            : undefined,
                    extent:
                        node.parentId && idMap.has(node.parentId)
                            ? node.extent
                            : undefined,
                    position: {
                        x: Number(node.position?.x || 0) + offset,
                        y: Number(node.position?.y || 0) + offset,
                    },
                    selected: true,
                    data,
                };
            });

            const remapEdgeDataIds = (edgeData) => {
                const nextData = cloneGraphValue(edgeData || {});

                [
                    "parallelOriginalSource",
                    "parallelOriginalTarget",
                    "compoundOriginalSource",
                    "compoundOriginalTarget",
                ].forEach((keyName) => {
                    if (nextData[keyName] && idMap.has(nextData[keyName])) {
                        nextData[keyName] = idMap.get(nextData[keyName]);
                    }
                });

                return nextData;
            };

            const pastedEdges = clipboard.edges.map((clipboardEdge) => {
                const edge = cloneGraphValue(clipboardEdge);

                return {
                    ...edge,
                    id: `edge-copy-${crypto.randomUUID()}`,
                    source: idMap.get(edge.source),
                    target: idMap.get(edge.target),
                    selected: false,
                    data: remapEdgeDataIds(edge.data),
                };
            });

            const pastedIds = new Set(
                pastedNodes.map((node) => node.id)
            );

            const nextNodes = orderNodesParentsFirst([
                ...nodes.map((node) => ({
                    ...node,
                    selected: false,
                })),
                ...pastedNodes,
            ]);

            setNodes(nextNodes);
            setEdges([
                ...edges.map((edge) => ({
                    ...edge,
                    selected: false,
                })),
                ...pastedEdges,
            ]);

            const firstPastedNode = pastedNodes.find(
                (node) => !node.parentId
            ) || pastedNodes[0];

            setSelectedNodeId(firstPastedNode?.id || null);

            // Slot paths live on the skill nodes. Rebuild the slot-view edges
            // so copied skills immediately retain their slot connections too.
            requestAnimationFrame(() => {
                checkSlotConnection(nextNodes);

                pastedIds.forEach((nodeId) => {
                    updateNodeInternals(nodeId);
                });
            });

            return true;
        };

        const handleGraphClipboardShortcut = (event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (activeMode === "code" || isTypingTarget(event.target)) return;

            const key = String(event.key || "").toLowerCase();

            if (key === "a") {
                event.preventDefault();
                clearAllEdgeSelection();
                setSelectedNodeId(null);

                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.selectable !== false,
                    }))
                );

                if (activeMode === "slots" || activeMode === "overview") {
                    setSlotNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: node.selectable !== false,
                        }))
                    );
                }
                return;
            }

            if (key === "c") {
                if (captureSelection()) {
                    event.preventDefault();
                }
                return;
            }

            if (key === "v") {
                if (graphClipboardRef.current) {
                    event.preventDefault();
                    pasteClipboard();
                }
                return;
            }

            if (key === "d") {
                if (!captureSelection()) return;
                event.preventDefault();
                pasteClipboard();
            }
        };

        // Capture phase makes the graph clipboard deterministic even when
        // React Flow or a focused panel component handles the same shortcut.
        window.addEventListener(
            "keydown",
            handleGraphClipboardShortcut,
            true
        );
        return () =>
            window.removeEventListener(
                "keydown",
                handleGraphClipboardShortcut,
                true
            );
    }, [
        activeMode,
        selectedNodeId,
        nodes,
        edges,
        setNodes,
        setEdges,
        setSlotNodes,
        clearAllEdgeSelection,
        updateNodeInternals,
    ]);

    const handleCreateManualSlot = (slotData) => {
        const newSlot = {
            id: `manual-${crypto.randomUUID()}`,
            path: slotData.path,
            type: slotData.type,
            inherited: slotData.isInherited
                ? { state: slotData.inheritedFrom || "" }
                : null,
        };

        const updatedManualSlots = [...manualSlots, newSlot];
        setManualSlots(updatedManualSlots);

        let updatedNodes = nodes;

        if (slotData.linkedSkillSlot) {
            const { nodeId, access, slotIndex } = slotData.linkedSkillSlot;
            const cleanPath = `/${normalizeSlotPath(slotData.path)}`;

            updatedNodes = nodes.map((node) => {
                if (node.id !== nodeId) return node;

                const key = access === "read" ? "inSlots" : "outSlots";
                return {
                    ...node,
                    data: {
                        ...node.data,
                        [key]: node.data[key].map((slot, index) =>
                            index === slotIndex
                                ? {
                                    ...slot,
                                    path: cleanPath,
                                    inherited: slotData.isInherited
                                        ? {
                                            state: "",
                                            xpath: cleanPath,
                                        }
                                        : null,
                                }
                                : slot
                        ),
                    },
                };
            });

            setNodes(updatedNodes);
        }

        checkSlotConnection(updatedNodes, updatedManualSlots);
    };

    const findResults = useMemo(() => {
        const query = findQuery.trim().toLowerCase();
        if (!query) return [];

        const results = [];

        // Search real executable nodes. Compound/Parallel are structural
        // containers and are intentionally omitted from "skill" results.
        (nodes || []).forEach((node) => {
            if (node.type !== "custom" && node.type !== "submachine") return;

            const label = String(node.data?.label || node.id);
            const fullName = String(node.data?.fullSkillName || "");
            const src = String(node.data?.src || "");
            const haystack = `${label} ${fullName} ${src}`.toLowerCase();

            if (!haystack.includes(query)) return;

            results.push({
                kind: node.type === "submachine" ? "behavior" : "skill",
                id: node.id,
                label,
                detail: fullName || src || node.id,
            });
        });

        const slotPaths = new Map();
        const addSlotPath = (path, type = "Unknown") => {
            const cleanPath = normalizeSlotPath(path);
            if (!cleanPath) return;

            const existing = slotPaths.get(cleanPath);
            slotPaths.set(cleanPath, {
                path: cleanPath,
                type:
                    existing?.type && existing.type !== "Unknown"
                        ? existing.type
                        : type || "Unknown",
            });
        };

        (slotNodes || []).forEach((node) =>
            addSlotPath(
                node.data?.path || node.data?.label,
                node.data?.slotType
            )
        );
        (manualSlots || []).forEach((slot) =>
            addSlotPath(slot.path, slot.type)
        );
        (nodes || []).forEach((node) => {
            [
                ...(node.data?.inSlots || []),
                ...(node.data?.outSlots || []),
                ...(node.data?.inheritedSlots || []),
            ].forEach((slot) => addSlotPath(slot.path, slot.type));
        });

        [...slotPaths.values()].forEach((slot) => {
            const displayPath = `/${slot.path}`;
            const haystack = `${displayPath} ${slot.type || ""}`.toLowerCase();
            if (!haystack.includes(query)) return;

            results.push({
                kind: "slot",
                id: `slot-${slot.path}`,
                label: displayPath,
                detail: slot.type || "Unknown",
            });
        });

        return results.slice(0, 50);
    }, [findQuery, nodes, slotNodes, manualSlots]);

    useEffect(() => {
        setFindResultIndex(0);
    }, [findQuery]);

    const focusFindResult = useCallback(
        (result) => {
            if (!result) return;

            clearAllEdgeSelection();

            if (result.kind === "slot") {
                if (activeMode === "event") {
                    setActiveMode("slots");
                }

                // Ensure a slot node exists even when the slot view has not
                // been opened since loading/importing this workflow.
                checkSlotConnection(nodes, manualSlots);
                setSelectedNodeId(result.id);

                window.setTimeout(() => {
                    setSlotNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: node.id === result.id,
                        }))
                    );
                    setNodes((currentNodes) =>
                        currentNodes.map((node) => ({
                            ...node,
                            selected: false,
                        }))
                    );

                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 40);
            } else {
                setNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: node.id === result.id,
                    }))
                );
                setSlotNodes((currentNodes) =>
                    currentNodes.map((node) => ({
                        ...node,
                        selected: false,
                    }))
                );
                setSelectedNodeId(result.id);
                setRightPanelTab("details");

                window.setTimeout(() => {
                    fitView({
                        nodes: [{ id: result.id }],
                        padding: 0.8,
                        maxZoom: 1.35,
                        duration: 250,
                    });
                }, 0);
            }

            setIsFindOpen(false);
        },
        [
            activeMode,
            nodes,
            manualSlots,
            setNodes,
            setSlotNodes,
            fitView,
            clearAllEdgeSelection,
        ]
    );

    // Reconfigure a skill after one of its parameters changes. The Bonsai skill
    // endpoint can expose a different set of events, sensors/actuators and slot
    // requests depending on the current parameter values.
    const skillConfigurationRequestVersionsRef = useRef(new Map());

    const reconcileDynamicSlots = (currentSlots = [], requestedSlots = []) =>
        (Array.isArray(requestedSlots) ? requestedSlots : []).map((requestedSlot) => {
            const existingSlot = (currentSlots || []).find(
                (slot) =>
                    slot?.key === requestedSlot?.key &&
                    normalizeSlotType(slot?.type) ===
                    normalizeSlotType(requestedSlot?.type)
            );

            return {
                ...requestedSlot,
                key: requestedSlot?.key || "",
                type: requestedSlot?.type || "Unknown",
                description:
                    requestedSlot?.description ?? existingSlot?.description ?? "",
                // Keep a user's existing connection when the same request is
                // still exposed. Newly exposed requests deliberately start
                // without a path and therefore show up as unconnected slots.
                path: existingSlot?.path || "",
                inherited: existingSlot?.inherited || null,
            };
        });

    const updateEventsFromParameters = async (nodeId, parameterOverride = null) => {
        const node = nodes.find((candidate) => candidate.id === nodeId);
        if (!node) return;

        const fullSkillName = String(node.data?.fullSkillName || "").split("#")[0];
        if (!fullSkillName) return;

        const params = {};
        const parameterList = Array.isArray(parameterOverride)
            ? parameterOverride
            : node.data?.params || [];

        parameterList.forEach((param) => {
            if (!param?.key) return;

            // An empty editor field means that the parameter is not supplied to
            // the skill. This is important for skills whose requested slots are
            // conditional on the presence of an optional parameter.
            const expr = param.expr;
            if (expr === undefined || expr === null || String(expr).trim() === "") {
                return;
            }

            params[param.key] = expr;
        });

        const requestVersions = skillConfigurationRequestVersionsRef.current;
        const requestVersion = (requestVersions.get(nodeId) || 0) + 1;
        requestVersions.set(nodeId, requestVersion);

        try {
            const data = await fetchSkillData(fullSkillName, params);
            if (!data) return;

            // If a newer edit was sent while this request was in flight, ignore
            // the stale response so old slot requests cannot overwrite new ones.
            if (requestVersions.get(nodeId) !== requestVersion) return;

            setNodes((currentNodes) => {
                const currentNode = currentNodes.find(
                    (candidate) => candidate.id === nodeId
                );
                if (!currentNode) return currentNodes;

                let nextEvents = currentNode.data?.events || [];
                if (Array.isArray(data.events)) {
                    const previousEvents = new Map(
                        (currentNode.data?.events || []).map((event) => [
                            event.id,
                            event,
                        ])
                    );

                    const configuredEvents = data.events.map((event) => {
                        const existing = previousEvents.get(event.event);
                        return {
                            ...(existing || {}),
                            id: event.event,
                            description: event.description || "",
                            selectedPackage: existing?.selectedPackage || "",
                            selectedSkill: existing?.selectedSkill || "",
                            target: existing?.target ?? null,
                            cond: existing?.cond || "",
                            assignments: existing?.assignments || [],
                            assignLocation: existing?.assignLocation || "",
                            assignExpr: existing?.assignExpr || "",
                        };
                    });

                    const appendBuiltInEvent = (eventId) => {
                        if (configuredEvents.some((event) => event.id === eventId)) {
                            return;
                        }
                        const existing = previousEvents.get(eventId);
                        configuredEvents.push({
                            ...(existing || {}),
                            id: eventId,
                            selectedPackage: existing?.selectedPackage || "",
                            selectedSkill: existing?.selectedSkill || "",
                            target: existing?.target ?? null,
                            cond: existing?.cond || "",
                            assignments: existing?.assignments || [],
                            assignLocation: existing?.assignLocation || "",
                            assignExpr: existing?.assignExpr || "",
                        });
                    };

                    appendBuiltInEvent("fatal");
                    appendBuiltInEvent("*");
                    nextEvents = configuredEvents;
                }

                const nextInSlots =
                    data.inSlots !== undefined
                        ? reconcileDynamicSlots(
                            currentNode.data?.inSlots || [],
                            data.inSlots
                        )
                        : currentNode.data?.inSlots || [];

                const nextOutSlots =
                    data.outSlots !== undefined
                        ? reconcileDynamicSlots(
                            currentNode.data?.outSlots || [],
                            data.outSlots
                        )
                        : currentNode.data?.outSlots || [];

                const updatedNodes = currentNodes.map((candidate) => {
                    if (candidate.id !== nodeId) return candidate;

                    return {
                        ...candidate,
                        data: {
                            ...candidate.data,
                            events: nextEvents,
                            sensors:
                                data.sensors !== undefined
                                    ? data.sensors
                                    : candidate.data?.sensors || [],
                            actuators:
                                data.actuator !== undefined
                                    ? data.actuator
                                    : data.actuators !== undefined
                                        ? data.actuators
                                        : candidate.data?.actuators || [],
                            inSlots: nextInSlots,
                            outSlots: nextOutSlots,
                        },
                    };
                });

                // Slot nodes/edges are derived from skill requests. Rebuild them
                // after the node update so newly exposed requests appear and
                // removed requests disappear immediately.
                window.requestAnimationFrame(() =>
                    checkSlotConnection(updatedNodes)
                );

                return updatedNodes;
            });
        } catch (error) {
            console.error("Error updating skill from parameters:", error);
        }
    };

    const handleImportFile = async (event) => {
        // Tauri desktop mode: event.fromDesktop triggers file picker via Tauri
        if (IS_DESKTOP && event?.fromDesktop) {
            try {
                const filePath = await openScxmlFileTauri();
                if (!filePath) return;

                const content = await readScxmlFileContent(filePath);
                if (!content) return;

                const parsed = await parseScxmlFile(content, fetchSkillData, getNodeId);
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(
                        parsed.nodes,
                        filePath
                    )).map(normalizeSharedScxmlStateIdentity)
                );

                setGlobalDataModel(parsed.globalDataModel);
                setNodes(parsedNodes);
                setEdges(parsed.edges);
                setManualSlots([]);
                setSelectedNodeId(null);

                const cleanTitle = filePath.split('/').pop().replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? {
                                ...t,
                                title: cleanTitle,
                                fileName: filePath.split(/[\\/]/).pop(),
                                fileHandle: null,
                                filePath,
                            }
                            : t
                    )
                );

                checkSlotConnection(parsedNodes);
                setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
            } catch (err) {
                console.error("Import error:", err);
                alert("Fehler beim Import:\n" + err.message);
            }
            return;
        }

        // Browser mode
        const file = event.target.files[0];
        if (!file) return;

        const handle = event.fileHandle || null;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = await parseScxmlFile(e.target.result, fetchSkillData, getNodeId);
                const parsedNodes = ensureSharedEditorInstanceIds(
                    (await hydrateSubMachineInheritedSlots(
                        parsed.nodes,
                        null
                    )).map(normalizeSharedScxmlStateIdentity)
                );

                setGlobalDataModel(parsed.globalDataModel);
                setNodes(parsedNodes);
                setEdges(parsed.edges);
                setManualSlots([]);
                setSelectedNodeId(null);

                const cleanTitle = file.name.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? { ...t, title: cleanTitle, fileName: file.name, fileHandle: handle }
                            : t
                    )
                );

                checkSlotConnection(parsedNodes);
                setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
            } catch (err) {
                alert("Import error:\n" + err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleSaveCurrentTab = async () => {
        if (nodes.length === 0) {
            alert("The graph is empty and cannot be saved.");
            return;
        }

        const currentActiveTab = tabs.find((t) => t.id === activeTabId);
        const exportGraph = prepareGraphForScxml(nodes, edges);
        const xml = generateXmlString(exportGraph.nodes, exportGraph.edges, globalDataModel);
        const defaultName = currentActiveTab?.fileName || `${currentActiveTab?.title || "workflow"}.xml`;

        let result;

        if (IS_DESKTOP) {
            // Tauri: direct save to filePath if exists, otherwise show save dialog
            result = await saveScxmlFileTauri(xml, currentActiveTab?.filePath, defaultName);
            if (result && result.success) {
                const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? {
                                ...t,
                                title: cleanTitle,
                                fileName: result.fileName,
                                filePath: result.filePath,
                            }
                            : t
                    )
                );
            }
        } else {
            // Browser mode
            result = await saveScxmlFile(xml, currentActiveTab?.fileHandle, defaultName);
            if (result && result.success) {
                const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? { ...t, title: cleanTitle, fileName: result.fileName, fileHandle: result.handle || t.fileHandle }
                            : t
                    )
                );
            }
        }
    };

    const handleSaveAsCurrentTab = async () => {
        if (nodes.length === 0) {
            alert("Der Graph ist leer und kann nicht gespeichert werden.");
            return;
        }

        const currentActiveTab = tabs.find((t) => t.id === activeTabId);
        const exportGraph = prepareGraphForScxml(nodes, edges);
        const xml = generateXmlString(exportGraph.nodes, exportGraph.edges, globalDataModel);
        const defaultName = currentActiveTab?.fileName || `${currentActiveTab?.title || "workflow"}.xml`;

        let result;

        if (IS_DESKTOP) {
            // Force save dialog by passing null path
            result = await saveScxmlFileTauri(xml, null, defaultName);
            if (result && result.success) {
                const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? {
                                ...t,
                                title: cleanTitle,
                                fileName: result.fileName,
                                filePath: result.filePath,
                            }
                            : t
                    )
                );
            }
        } else {
            // Browser mode - always show save dialog by passing null handle
            result = await saveScxmlFile(xml, null, defaultName);
            if (result && result.success) {
                const cleanTitle = result.fileName.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? { ...t, title: cleanTitle, fileName: result.fileName, fileHandle: result.handle || t.fileHandle }
                            : t
                    )
                );
            }
        }
    };


    // Global editor shortcuts that depend on actions declared above. Keep them
    // disabled while typing in form fields or code editors so normal text
    // editing shortcuts keep their expected behavior.
    useEffect(() => {
        const isTypingTarget = (target) => {
            if (!(target instanceof Element)) return false;

            return Boolean(
                target.closest(
                    'input, textarea, select, [contenteditable="true"], .monaco-editor, .cm-editor'
                )
            );
        };

        const clearGraphSelection = () => {
            setNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: false,
                }))
            );
            setSlotNodes((currentNodes) =>
                currentNodes.map((node) => ({
                    ...node,
                    selected: false,
                }))
            );
            clearAllEdgeSelection();
            setSelectedNodeId(null);
        };

        const handleGlobalShortcut = (event) => {
            const key = String(event.key || "").toLowerCase();
            const hasModifier = event.ctrlKey || event.metaKey;

            // Escape is useful even while focus is inside the search field.
            if (key === "escape") {
                if (isFindOpen) {
                    event.preventDefault();
                    setIsFindOpen(false);
                    return;
                }

                if (contextMenu) {
                    event.preventDefault();
                    setContextMenu(null);
                    return;
                }

                if (drawerData.isOpen) {
                    event.preventDefault();
                    setDrawerData((previous) => ({
                        ...previous,
                        isOpen: false,
                    }));
                    return;
                }

                if (isCreateSlotModalOpen) {
                    event.preventDefault();
                    setIsCreateSlotModalOpen(false);
                    return;
                }

                if (isShortcutHelpOpen) {
                    event.preventDefault();
                    setIsShortcutHelpOpen(false);
                    return;
                }

                if (!isTypingTarget(event.target) && activeMode !== "code") {
                    event.preventDefault();
                    clearGraphSelection();
                }
                return;
            }

            if (hasModifier && !event.altKey) {
                if (key === "s") {
                    event.preventDefault();
                    if (event.shiftKey) {
                        void handleSaveAsCurrentTab();
                    } else {
                        void handleSaveCurrentTab();
                    }
                    return;
                }

                if (key === "n") {
                    event.preventDefault();
                    handleAddNewTab();
                    return;
                }

                if (key === "w") {
                    event.preventDefault();
                    handleCloseTab(activeTabId);
                    return;
                }

                if (key === "1") {
                    event.preventDefault();
                    setActiveMode("event");
                    return;
                }

                if (key === "2") {
                    event.preventDefault();
                    setActiveMode("slots");
                    return;
                }

                if (key === "3") {
                    event.preventDefault();
                    setActiveMode("overview");
                    return;
                }

                return;
            }

            if (isTypingTarget(event.target) || activeMode === "code") return;
            if (event.altKey || hasModifier || key !== "f") return;

            event.preventDefault();

            if (event.shiftKey) {
                const selectedIds = [
                    ...nodes
                        .filter((node) => node.selected)
                        .map((node) => node.id),
                    ...(
                        activeMode === "slots" || activeMode === "overview"
                            ? slotNodes
                                .filter((node) => node.selected)
                                .map((node) => node.id)
                            : []
                    ),
                ];

                if (selectedIds.length === 0) return;

                fitView({
                    nodes: selectedIds.map((id) => ({ id })),
                    padding: 0.55,
                    maxZoom: 1.3,
                    duration: 250,
                });
                return;
            }

            fitView({
                padding: 0.2,
                duration: 250,
            });
        };

        window.addEventListener("keydown", handleGlobalShortcut);
        return () =>
            window.removeEventListener("keydown", handleGlobalShortcut);
    }, [
        activeMode,
        activeTabId,
        contextMenu,
        drawerData.isOpen,
        isCreateSlotModalOpen,
        isFindOpen,
        isShortcutHelpOpen,
        nodes,
        slotNodes,
        fitView,
        setNodes,
        setSlotNodes,
        clearAllEdgeSelection,
        handleAddNewTab,
        handleCloseTab,
        handleSaveCurrentTab,
        handleSaveAsCurrentTab,
    ]);

    const handleNodeDragStart = useCallback((event, node) => {
        setIsDraggingNode(true);
        setDraggedEditorNodeId(node.id);
        setHoveredEditorEdgeId(null);

        // Nodes innerhalb einer Lane dürfen vorübergehend den
        // bisherigen Parent verlassen.
        if (getLaneForNode(node, nodes) || getDirectCompoundForNode(node, nodes)) {
            setNodes((currentNodes) =>
                currentNodes.map((candidate) =>
                    candidate.id === node.id
                        ? { ...candidate, extent: undefined }
                        : candidate
                )
            );
        }
    }, [nodes, setNodes]);

    const handleNodeDrag = useCallback((event, draggedNode) => {
        const isOverTrash = Boolean(
            document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest(".trash-bin-dropzone")
        );

        setIsOverTrash(isOverTrash);

        // Parallel-lane helper nodes are layout-only and are never reparented.
        // Compound and parallel states, however, are real SCXML states and can
        // be nested just like normal states.
        if (isOverTrash || draggedNode.type === "parallelLane") {
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        const pointerPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const canDropIntoParallelLane = draggedNode.type !== "parallel";
        // Compounds are real state containers and may be nested inside other
        // compounds. Cycles are prevented by the descendant check below.
        const canDropIntoCompound = true;

        const hoveredLane = canDropIntoParallelLane
            ? nodes
                .filter(
                    (candidate) =>
                        candidate.type === "parallelLane" &&
                        // Do not allow a container to become a child of one of
                        // its own descendants.
                        !isNodeInsideContainer(
                            candidate,
                            draggedNode.id,
                            nodes
                        )
                )
                .find((lane) => {
                    const lanePosition = getAbsoluteNodePosition(
                        lane,
                        nodes
                    );

                    const width = Number(lane.style?.width) || 420;
                    const height = Number(lane.style?.height) || 110;

                    return (
                        pointerPosition.x >= lanePosition.x &&
                        pointerPosition.x <= lanePosition.x + width &&
                        pointerPosition.y >= lanePosition.y &&
                        pointerPosition.y <= lanePosition.y + height
                    );
                })
            : null;

        const hoveredCompound = canDropIntoCompound
            ? nodes
            .filter(
                (candidate) =>
                    candidate.type === "compound" &&
                    candidate.id !== draggedNode.id &&
                    !isNodeInsideContainer(
                        candidate,
                        draggedNode.id,
                        nodes
                    )
            )
            .filter((compound) => {
                const pos = getAbsoluteNodePosition(compound, nodes);
                const { width, height } = getNodeSize(compound);
                return pointerPosition.x >= pos.x && pointerPosition.x <= pos.x + width &&
                    pointerPosition.y >= pos.y && pointerPosition.y <= pos.y + height;
            })
            // Nested compounds overlap their parents. Prefer the deepest
            // visible compound under the pointer so Compound -> Compound
            // nesting remains usable at arbitrary depth.
            .sort(
                (a, b) =>
                    getNodeNestingDepth(b, nodes) -
                    getNodeNestingDepth(a, nodes)
            )[0] || null
            : null;

        setCompoundDropTargetId(hoveredCompound?.id || null);
        setParallelDropTargetId(hoveredCompound ? null : (hoveredLane?.id || null));
    }, [nodes, screenToFlowPosition]);

    const handleNodeDragStop = useCallback((event, node) => {
        const element = document.elementFromPoint(
            event.clientX,
            event.clientY
        );

        if (element?.closest(".trash-bin-dropzone")) {
            setNodes((currentNodes) => {
                const idsToDelete = new Set([node.id]);
                let foundNew = true;

                while (foundNew) {
                    foundNew = false;

                    currentNodes.forEach((candidate) => {
                        if (
                            candidate.parentId &&
                            idsToDelete.has(candidate.parentId) &&
                            !idsToDelete.has(candidate.id)
                        ) {
                            idsToDelete.add(candidate.id);
                            foundNew = true;
                        }
                    });
                }

                setEdges((currentEdges) =>
                    currentEdges.filter(
                        (edge) =>
                            !idsToDelete.has(edge.source) &&
                            !idsToDelete.has(edge.target) &&
                            !idsToDelete.has(
                                edge.data?.compoundOriginalSource
                            ) &&
                            !idsToDelete.has(
                                edge.data?.compoundOriginalTarget
                            ) &&
                            !idsToDelete.has(
                                edge.data?.parallelOriginalSource
                            ) &&
                            !idsToDelete.has(
                                edge.data?.parallelOriginalTarget
                            )
                    )
                );

                setSlotEdges((currentEdges) => {
                    const updatedEdges = currentEdges.filter(
                        (edge) =>
                            !idsToDelete.has(edge.source) &&
                            !idsToDelete.has(edge.target)
                    );

                    setSlotNodes((currentSlotNodes) =>
                        currentSlotNodes.filter((slotNode) =>
                            updatedEdges.some(
                                (edge) =>
                                    edge.source === slotNode.id ||
                                    edge.target === slotNode.id
                            )
                        )
                    );

                    return updatedEdges;
                });

                setSelectedNodeId((id) =>
                    idsToDelete.has(id) ? null : id
                );

                return currentNodes
                    .filter(
                        (candidate) =>
                            !idsToDelete.has(candidate.id)
                    )
                    .map((candidate) => {
                        if (candidate.type !== "compound") {
                            return candidate;
                        }

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (event) =>
                                        !idsToDelete.has(
                                            event.sourceNodeId
                                        )
                                ),
                            },
                        };
                    });
            });

            setIsDraggingNode(false);
            setDraggedEditorNodeId(null);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        // Parallel-lane helper nodes themselves are not draggable between
        // containers. Compound and parallel states are intentionally allowed.
        if (node.type === "parallelLane") {
            setIsDraggingNode(false);
            setDraggedEditorNodeId(null);
            setIsOverTrash(false);
            setParallelDropTargetId(null);
            setCompoundDropTargetId(null);
            return;
        }

        const dropPoint = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setNodes((currentNodes) => {
            const draggedNode = currentNodes.find(
                (candidate) => candidate.id === node.id
            );

            if (!draggedNode) {
                return currentNodes;
            }

            const sourceCompound = getDirectCompoundForNode(
                draggedNode,
                currentNodes
            );

            const targetCompound = currentNodes
                .filter(
                    (c) =>
                        c.type === "compound" &&
                        c.id !== draggedNode.id &&
                        // Never allow a compound to become a child of one of
                        // its own descendants. Compound -> Compound itself is
                        // otherwise fully supported.
                        !isNodeInsideContainer(
                            c,
                            draggedNode.id,
                            currentNodes
                        )
                )
                .filter((compound) => {
                    const p = getAbsoluteNodePosition(
                        compound,
                        currentNodes
                    );

                    const z = getNodeSize(compound);

                    return (
                        dropPoint.x >= p.x &&
                        dropPoint.x <= p.x + z.width &&
                        dropPoint.y >= p.y &&
                        dropPoint.y <= p.y + z.height
                    );
                })
                .sort(
                    (a, b) =>
                        getNodeNestingDepth(b, currentNodes) -
                        getNodeNestingDepth(a, currentNodes)
                )[0] || null;


            // ---------------------------------------------------------
            // Node befindet sich bereits im selben Compound
            // -> Position NICHT automatisch verändern
            // -> Node darf frei innerhalb des Compounds bewegt werden
            // ---------------------------------------------------------

            if (
                sourceCompound &&
                targetCompound &&
                sourceCompound.id === targetCompound.id
            ) {
                // Keep the containing compound fitted to all immediate
                // children, including nested compounds, and propagate any
                // size change through outer compound ancestors.
                const next = fitCompoundAndAncestorCompounds(
                    [...currentNodes],
                    sourceCompound.id
                );

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
            }

            if (
                !getLaneForNode(draggedNode, currentNodes) &&
                (sourceCompound || targetCompound)
            ) {
                const absolute = getAbsoluteNodePosition(
                    draggedNode,
                    currentNodes
                );

                // Zunächst aus aktuellem Parent lösen
                let next = currentNodes.map((c) =>
                    c.id === draggedNode.id
                        ? {
                            ...c,
                            parentId: undefined,
                            extent: undefined,
                            position: absolute,
                        }
                        : c
                );

                if (targetCompound) {
                    const compoundPosition =
                        getAbsoluteNodePosition(
                            targetCompound,
                            currentNodes
                        );

                    // Absolute Position der Node in eine
                    // relative Compound-Position umrechnen
                    const relativePosition = {
                        x: absolute.x - compoundPosition.x,
                        y: absolute.y - compoundPosition.y,
                    };

                    next = next.map((c) =>
                        c.id === draggedNode.id
                            ? {
                                ...c,
                                parentId: targetCompound.id,
                                extent: "parent",
                                expandParent: true,

                                // Drop-Position beibehalten
                                position: {
                                    x: Math.max(
                                        COMPOUND_PADDING_X,
                                        relativePosition.x
                                    ),
                                    y: Math.max(
                                        COMPOUND_HEADER_HEIGHT,
                                        relativePosition.y
                                    ),
                                },
                            }
                            : c
                    );
                }

                else {
                    next = next.map((c) =>
                        c.id === draggedNode.id
                            ? {
                                ...c,
                                position: {
                                    x: dropPoint.x,
                                    y: dropPoint.y,
                                },
                            }
                            : c
                    );
                }

                // Auto-fit both the old and new compound after reparenting.
                // This uses the real React Flow dimensions (width/height +
                // style) and therefore also works after manual NodeResizer use.
                // Fitting is propagated through nested compound ancestors.
                if (sourceCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        sourceCompound.id
                    );
                }

                if (targetCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        targetCompound.id
                    );
                }



                /*
                 * Keep outgoing compound transitions consistent when a child
                 * state is moved into, out of, or between compounds.
                 *
                 * The persisted/logical transition remains the external edge.
                 * A separate display edge connects the real child state to the
                 * matching exit point on the compound boundary.
                 */
                let rewrittenEdges = [...edges];

                if (sourceCompound) {
                    const oldCompoundExitIds = new Set(
                        rewrittenEdges
                            .filter(
                                (edge) =>
                                    edge.data?.compoundOriginalSource ===
                                    draggedNode.id
                            )
                            .map(
                                (edge) =>
                                    edge.data?.compoundExitId ||
                                    edge.sourceHandle
                            )
                            .filter(Boolean)
                    );

                    // Remove the old child -> compound boundary helper edges.
                    rewrittenEdges = rewrittenEdges.filter(
                        (edge) =>
                            !(
                                edge.data?.compoundInternalEdge &&
                                edge.source === draggedNode.id &&
                                edge.target === sourceCompound.id
                            )
                    );

                    // Turn the external compound edges back into ordinary
                    // transitions from the actual child before potentially
                    // wrapping them for the new compound below.
                    rewrittenEdges = rewrittenEdges.map((edge) => {
                        if (
                            edge.data?.compoundOriginalSource !==
                            draggedNode.id
                        ) {
                            return edge;
                        }

                        const restoredHandle =
                            edge.data?.compoundOriginalSourceHandle ||
                            edge.sourceHandle ||
                            "success";

                        const restoredData = {
                            ...(edge.data || {}),
                        };

                        delete restoredData.compoundOriginalSource;
                        delete restoredData.compoundOriginalSourceHandle;
                        delete restoredData.compoundExitId;

                        return {
                            ...edge,
                            source: draggedNode.id,
                            sourceHandle: restoredHandle,
                            label: edge.label || restoredHandle,
                            data: restoredData,
                        };
                    });

                    // Remove exit points that belonged to this child from the
                    // old compound. Other child exits stay untouched.
                    next = next.map((candidate) => {
                        if (candidate.id !== sourceCompound.id) {
                            return candidate;
                        }

                        return {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (event) =>
                                        event.sourceNodeId !==
                                        draggedNode.id &&
                                        !oldCompoundExitIds.has(event.id)
                                ),
                            },
                        };
                    });
                }

                if (targetCompound) {
                    const targetMemberIds = new Set(
                        next
                            .filter(
                                (candidate) =>
                                    candidate.parentId ===
                                    targetCompound.id
                            )
                            .map((candidate) => candidate.id)
                    );

                    const baseName =
                        draggedNode.data?.label ||
                        draggedNode.data?.fullSkillName
                            ?.split("#")[0]
                            ?.split(".")
                            ?.pop() ||
                        "state";

                    const compoundEventsById = new Map(
                        (
                            next.find(
                                (candidate) =>
                                    candidate.id === targetCompound.id
                            )?.data?.events || []
                        ).map((event) => [
                            String(event.id),
                            event,
                        ])
                    );

                    const internalEdgesByExitId = new Map();

                    rewrittenEdges = rewrittenEdges.map((edge) => {
                        if (
                            edge.source !== draggedNode.id ||
                            edge.data?.compoundInternalEdge
                        ) {
                            return edge;
                        }

                        // A transition between two children of the same
                        // compound remains an ordinary internal transition.
                        if (
                            targetMemberIds.has(edge.target) ||
                            edge.target === targetCompound.id
                        ) {
                            return edge;
                        }

                        const originalHandleId = String(
                            edge.sourceHandle || "success"
                        );
                        const compoundExitId =
                            `${draggedNode.id}-${originalHandleId}`;
                        const exitLabel =
                            `${baseName}.${originalHandleId}`;

                        if (
                            !compoundEventsById.has(compoundExitId)
                        ) {
                            compoundEventsById.set(
                                compoundExitId,
                                {
                                    id: compoundExitId,
                                    name: exitLabel,
                                    rawEvent: exitLabel,
                                    target: edge.target,
                                    sourceNodeId: draggedNode.id,
                                    transitionHandleId:
                                    originalHandleId,
                                }
                            );
                        }

                        if (
                            !internalEdgesByExitId.has(
                                compoundExitId
                            )
                        ) {
                            internalEdgesByExitId.set(
                                compoundExitId,
                                {
                                    id:
                                        `edge-internal-compound-${draggedNode.id}-` +
                                        `${originalHandleId}-${targetCompound.id}-` +
                                        crypto.randomUUID(),
                                    source: draggedNode.id,
                                    target: targetCompound.id,
                                    sourceHandle:
                                    originalHandleId,
                                    targetHandle:
                                        `target-${compoundExitId}`,
                                    type: "smoothstep",
                                    selectable: false,
                                    focusable: false,
                                    style: {
                                        strokeDasharray: "4 4",
                                        stroke: "#0284c7",
                                        strokeWidth: 1.5,
                                    },
                                    data: {
                                        compoundInternalEdge: true,
                                        compoundExitId,
                                    },
                                }
                            );
                        }

                        return {
                            ...edge,
                            source: targetCompound.id,
                            sourceHandle: compoundExitId,
                            label:
                                edge.label ||
                                originalHandleId,
                            data: {
                                ...(edge.data || {}),
                                compoundOriginalSource:
                                draggedNode.id,
                                compoundOriginalSourceHandle:
                                originalHandleId,
                                compoundExitId,
                            },
                        };
                    });

                    rewrittenEdges.push(
                        ...internalEdgesByExitId.values()
                    );

                    const nextCompoundEvents = [
                        ...compoundEventsById.values(),
                    ].filter(
                        (event) =>
                            String(event?.id || "") !== "compound-entry"
                    );

                    next = next.map((candidate) =>
                        candidate.id === targetCompound.id
                            ? {
                                ...candidate,
                                data: {
                                    ...candidate.data,
                                    events: nextCompoundEvents,
                                },
                            }
                            : candidate
                    );
                }

                // Events can change the exit gutter width, so do one final
                // fit after the compound transition metadata has been updated.
                if (sourceCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        sourceCompound.id
                    );
                }

                if (targetCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        targetCompound.id
                    );
                }

                setEdges(rewrittenEdges);

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
            }

            const sourceLane = getLaneForNode(
                draggedNode,
                currentNodes
            );

            const targetLane = draggedNode.type !== "parallel"
                ? currentNodes
                    .filter(
                        (candidate) =>
                            candidate.type === "parallelLane" &&
                            !isNodeInsideContainer(
                                candidate,
                                draggedNode.id,
                                currentNodes
                            )
                    )
                    .find((lane) => {
                        const position = getAbsoluteNodePosition(
                            lane,
                            currentNodes
                        );

                        const width =
                            Number(lane.style?.width) || 420;
                        const height =
                            Number(lane.style?.height) || 110;

                        return (
                            dropPoint.x >= position.x &&
                            dropPoint.x <= position.x + width &&
                            dropPoint.y >= position.y &&
                            dropPoint.y <= position.y + height
                        );
                    })
                : null;

            // Die Node wurde lediglich innerhalb derselben Lane bewegt.
            // Keep its free position, but still allow the lane/parallel to
            // grow when the node reaches beyond the manually resized bounds.
            if (targetLane?.id === sourceLane?.id) {
                let next = currentNodes.map((candidate) =>
                    candidate.id === draggedNode.id
                        ? {
                            ...candidate,
                            extent: "parent",
                            expandParent: true,
                        }
                        : candidate
                );

                if (sourceCompound?.id) {
                    next = fitCompoundAndAncestorCompounds(
                        next,
                        sourceCompound.id
                    );
                }

                if (sourceLane?.parentId) {
                    next = growParallelToLaneContents(
                        next,
                        sourceLane.parentId
                    );
                }

                return resolveNodeCollisionsAndRefit(next, draggedNode.id);
            }

            const sourceParallel = sourceLane
                ? currentNodes.find(
                    (candidate) =>
                        candidate.id === sourceLane.parentId
                )
                : null;

            const targetParallel = targetLane
                ? currentNodes.find(
                    (candidate) =>
                        candidate.id === targetLane.parentId
                )
                : null;

            const absolutePosition = getAbsoluteNodePosition(
                draggedNode,
                currentNodes
            );

            let nextNodes = currentNodes.filter(
                (candidate) => candidate.id !== draggedNode.id
            );

            const normalizeLane = (lane, nodeToArrangeId = null) => {
                if (!lane) return;

                const currentLane =
                    nextNodes.find((candidate) => candidate.id === lane.id) ||
                    lane;

                let directChildren = nextNodes.filter(
                    (candidate) => candidate.parentId === currentLane.id
                );

                // A lane may already have the automatically managed compound
                // wrapper used when it contains multiple branch states.
                let wrapper = directChildren.find(
                    (candidate) => isAutoParallelLaneCompound(candidate)
                );

                const parentId = wrapper?.id || currentLane.id;

                let members = wrapper
                    ? nextNodes.filter(
                        (candidate) => candidate.parentId === wrapper.id
                    )
                    : directChildren.filter(isParallelLaneSkillCandidate);

                if (nodeToArrangeId) {
                    const newNode = members.find(
                        (member) => member.id === nodeToArrangeId
                    );

                    if (newNode) {
                        const existingMembers = members.filter(
                            (member) => member.id !== nodeToArrangeId
                        );

                        const newX =
                            25 + existingMembers.reduce((x, member) => {
                                const size = getNodeSize(member);
                                return x + size.width + PARALLEL_NODE_GAP;
                            }, 0);

                        nextNodes = nextNodes.map((candidate) => {
                            if (candidate.id !== nodeToArrangeId) {
                                return candidate;
                            }

                            return {
                                ...candidate,
                                parentId,
                                extent: "parent",
                                expandParent: true,
                                position: {
                                    x: newX,
                                    // When a lane has a compound wrapper, its
                                    // children must begin below the compound
                                    // header just like in a normal compound.
                                    y: wrapper
                                        ? COMPOUND_HEADER_HEIGHT
                                        : 20,
                                },
                            };
                        });
                    }
                }

                // If this lane owns an auto compound, fit that compound to its
                // children before calculating the lane/parallel dimensions.
                if (wrapper) {
                    nextNodes = fitCompoundToChildren(
                        nextNodes,
                        wrapper.id
                    );
                    wrapper = nextNodes.find(
                        (candidate) => candidate.id === wrapper.id
                    );
                }

                const parallel = nextNodes.find(
                    (candidate) => candidate.id === currentLane.parentId
                );

                if (!parallel) return;

                nextNodes = growParallelToLaneContents(
                    nextNodes,
                    parallel.id
                );
            };

            if (targetLane) {
                // Vorhandenen Compound der Lane suchen
                const wrapper = nextNodes.find(
                    (candidate) =>
                        candidate.parentId === targetLane.id &&
                        isAutoParallelLaneCompound(candidate)
                );


                const targetParent = wrapper || targetLane;

                // Absolute Position des Parents bestimmen
                const parentAbsolutePosition =
                    getAbsoluteNodePosition(
                        targetParent,
                        nextNodes
                    );

                nextNodes.push({
                    ...draggedNode,

                    parentId: targetParent.id,
                    extent: "parent",
                    expandParent: true,

                    position: {
                        x:
                            absolutePosition.x -
                            parentAbsolutePosition.x,

                        y:
                            absolutePosition.y -
                            parentAbsolutePosition.y,
                    },

                    selected: false,
                });
            } else if (sourceLane) {
                // Node wurde aus einem Parallel State gezogen.
                const hasTransition = edges.some(
                    (edge) =>
                        !edge.id.startsWith("edge-internal-") &&
                        (
                            edge.source === draggedNode.id ||
                            edge.target === draggedNode.id ||
                            edge.data?.parallelOriginalSource ===
                            draggedNode.id ||
                            edge.data?.parallelOriginalTarget ===
                            draggedNode.id
                        )
                );

                const parallelPosition = sourceParallel
                    ? getAbsoluteNodePosition(
                        sourceParallel,
                        currentNodes
                    )
                    : absolutePosition;

                nextNodes.push({
                    ...draggedNode,
                    parentId: undefined,
                    extent: undefined,
                    position: hasTransition
                        ? absolutePosition
                        : {
                            x: dropPoint.x,
                            y: dropPoint.y,
                        },
                    selected: false,
                });
            } else {
                nextNodes.push({
                    ...draggedNode,
                    extent: undefined,
                });
            }

            normalizeLane(sourceLane);

            // In der neuen Lane NUR die gerade gedroppte Node einordnen.
            if (
                targetLane &&
                targetLane.id !== sourceLane?.id
            ) {
                normalizeLane(
                    targetLane,
                    draggedNode.id
                );
            }

            let nextEdges = edges;

            if (sourceLane) {
                const internalHandles = nextEdges
                    .filter(
                        (edge) =>
                            edge.source === draggedNode.id &&
                            edge.target === sourceLane.id &&
                            edge.id.startsWith("edge-internal-")
                    )
                    .map((edge) => edge.sourceHandle);

                // Interne Verbindungen zum alten Lane-Rand entfernen.
                nextEdges = nextEdges
                    .filter(
                        (edge) =>
                            !(
                                edge.source === draggedNode.id &&
                                edge.target === sourceLane.id &&
                                edge.id.startsWith(
                                    "edge-internal-"
                                )
                            )
                    )
                    .map((edge) => {
                        if (
                            edge.data?.parallelOriginalSource ===
                            draggedNode.id
                        ) {
                            return {
                                ...edge,
                                source: draggedNode.id,
                                data: {
                                    ...edge.data,
                                    parallelOriginalSource:
                                    undefined,
                                },
                            };
                        }

                        if (
                            edge.data?.parallelOriginalTarget ===
                            draggedNode.id
                        ) {
                            return {
                                ...edge,
                                target: draggedNode.id,
                                targetHandle: null,
                                data: {
                                    ...edge.data,
                                    parallelOriginalTarget:
                                    undefined,
                                },
                            };
                        }

                        return edge;
                    });

                const stillUsedHandles = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.target === sourceLane.id &&
                                edge.id.startsWith(
                                    "edge-internal-"
                                )
                        )
                        .map((edge) => edge.sourceHandle)
                );

                nextNodes = nextNodes.map((candidate) =>
                    candidate.id === sourceLane.id
                        ? {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: (
                                    candidate.data?.events || []
                                ).filter(
                                    (item) =>
                                        !internalHandles.includes(
                                            item.id
                                        ) ||
                                        stillUsedHandles.has(
                                            item.id
                                        )
                                ),
                            },
                        }
                        : candidate
                );
            }

            if (targetLane && targetParallel) {
                const outgoingIds = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.source === draggedNode.id &&
                                edge.target !== targetLane.id
                        )
                        .map((edge) => edge.id)
                );

                const incomingIds = new Set(
                    nextEdges
                        .filter(
                            (edge) =>
                                edge.target === draggedNode.id &&
                                edge.source !== draggedNode.id
                        )
                        .map((edge) => edge.id)
                );

                const internalEdges = [];
                const laneEvents = [
                    ...(targetLane.data?.events || []),
                ];

                nextEdges = nextEdges.map((edge) => {
                    if (outgoingIds.has(edge.id)) {
                        const handleId =
                            edge.sourceHandle || "success";

                        if (
                            !laneEvents.some(
                                (item) => item.id === handleId
                            )
                        ) {
                            const baseName =
                                draggedNode.data?.label ||
                                draggedNode.data
                                    ?.fullSkillName ||
                                "state";

                            laneEvents.push({
                                id: handleId,
                                name: `${baseName}.${handleId}`,
                                rawEvent: `${baseName}.${handleId}`,
                                target: edge.target,
                            });
                        }

                        internalEdges.push({
                            id:
                                `edge-internal-${draggedNode.id}-` +
                                `${handleId}-${targetLane.id}`,
                            source: draggedNode.id,
                            target: targetLane.id,
                            sourceHandle: handleId,
                            targetHandle: `target-${handleId}`,
                            style: {
                                strokeDasharray: "4 4",
                                stroke: "#0284c7",
                                strokeWidth: 1.5,
                            },
                            type: "smoothstep",
                        });

                        return {
                            ...edge,
                            source: targetLane.id,
                            data: {
                                ...edge.data,
                                parallelOriginalSource:
                                draggedNode.id,
                            },
                        };
                    }

                    if (incomingIds.has(edge.id)) {
                        return {
                            ...edge,
                            target: targetParallel.id,
                            targetHandle: "target",
                            data: {
                                ...edge.data,
                                parallelOriginalTarget:
                                draggedNode.id,
                            },
                        };
                    }

                    return edge;
                });

                nextEdges = [
                    ...nextEdges,
                    ...internalEdges,
                ];

                nextNodes = nextNodes.map((candidate) =>
                    candidate.id === targetLane.id
                        ? {
                            ...candidate,
                            data: {
                                ...candidate.data,
                                events: laneEvents,
                            },
                        }
                        : candidate
                );
            }

            setEdges(nextEdges);

            // React Flow benötigt Parent-Nodes vor ihren Children.
            return resolveNodeCollisionsAndRefit(nextNodes, draggedNode.id);
        });

        // Slot nodes live in a separate state array, but in Slot/Overview mode
        // they share the same React Flow canvas with root state nodes. Run one
        // final root-scope pass after React has committed the drag so a slot
        // cannot overlap a root skill (and vice versa). Nested states are still
        // handled only inside their own parent scope above.
        if (activeMode === "slots" || activeMode === "overview") {
            requestAnimationFrame(() => {
                const currentVisibleNodes = getNodes();
                const focusNode = currentVisibleNodes.find(
                    (candidate) => candidate.id === node.id
                );

                if (
                    !focusNode ||
                    focusNode.parentId ||
                    focusNode.type === "parallelLane"
                ) {
                    return;
                }

                const resolvedVisibleNodes = resolveCollisionScope(
                    currentVisibleNodes,
                    node.id,
                    NODE_COLLISION_OPTIONS
                );
                const positionsById = new Map(
                    resolvedVisibleNodes.map((candidate) => [
                        candidate.id,
                        candidate.position,
                    ])
                );

                setNodes((currentNodes) =>
                    currentNodes.map((candidate) => {
                        if (candidate.parentId) return candidate;
                        const position = positionsById.get(candidate.id);
                        return position
                            ? { ...candidate, position }
                            : candidate;
                    })
                );

                setSlotNodes((currentSlotNodes) =>
                    currentSlotNodes.map((candidate) => {
                        const position = positionsById.get(candidate.id);
                        return position
                            ? { ...candidate, position }
                            : candidate;
                    })
                );
            });
        }

        setIsDraggingNode(false);
        setDraggedEditorNodeId(null);
        setIsOverTrash(false);
        setParallelDropTargetId(null);
        setCompoundDropTargetId(null);
    }, [
        activeMode,
        edges,
        getNodes,
        screenToFlowPosition,
        setNodes,
        setEdges,
        setSlotEdges,
        setSlotNodes,
    ]);


    const getTabDisplayPath = (tab) => {
        if (!tab) return "";

        return (
            tab.filePath ||
            tab.sourcePath ||
            tab.fileName ||
            "Unsaved workflow"
        );
    };

    const handleTabMouseEnter = (event, tab) => {
        const rect = event.currentTarget.getBoundingClientRect();

        const tooltipWidth = 320;
        const gap = 8;
        const viewportPadding = 8;

        let left = rect.left;

        if (left + tooltipWidth > window.innerWidth - viewportPadding) {
            left = Math.max(
                viewportPadding,
                window.innerWidth - tooltipWidth - viewportPadding
            );
        }

        setTabPathTooltip({
            path: getTabDisplayPath(tab),
            left,
            top: rect.bottom + gap,
        });
    };

    const handleTabMouseLeave = () => {
        setTabPathTooltip(null);
    };

    return (
        <div className="container">
            <Header onImportFile={handleImportFile} onSaveFile={handleSaveCurrentTab} onSaveAsFile={handleSaveAsCurrentTab} hasFilePath={IS_DESKTOP && tabs.find(t => t.id === activeTabId)?.filePath !== null} />

            <div className="app">
                {leftLibraryTab === "skills" ? (
                    <SkillLibrary
                        searchText={searchText}
                        setSearchText={setSearchText}
                        activeFilter={activeFilter}
                        setActiveFilter={setActiveFilter}
                        packages={packages}
                        selectedPackage={selectedPackage}
                        setSelectedPackage={(pkg) => {
                            setSelectedPackage(pkg);
                            setSelectedSubPackage(null);
                        }}
                        searchedSkills={searchedSkills}
                        packageSkills={packageSkills}
                        filteredSkills={filteredSkills}
                        subPackages={subPackages}
                        selectedSubPackage={selectedSubPackage}
                        setSelectedSubPackage={setSelectedSubPackage}
                        directSkills={directSkills}
                        activeLibraryTab={leftLibraryTab}
                        onLibraryTabChange={setLeftLibraryTab}
                        onReloadSkills={() => fetchSkills({ manual: true })}
                        isReloadingSkills={isReloadingSkills}
                        refreshVersion={skillLibraryRefreshVersion}
                    />
                ) : (
                    <BehaviorLibrary
                        directories={behaviorDirectories}
                        onDirectoriesChange={setBehaviorDirectories}
                        onOpenBehavior={handleOpenBehaviorFile}
                        activeLibraryTab={leftLibraryTab}
                        onLibraryTabChange={setLeftLibraryTab}
                    />
                )}

                <main className="editor-area">
                    {/* IntelliJ-Style Tab Bar */}
                    <div className="editor-header-intellij">
                        <div className="editor-title-badge">
                            <span>Node Editor</span>
                        </div>

                        <div className="intellij-tabs-container">
                            {tabs.map((tab) => (
                                <div
                                    key={tab.id}
                                    className={`intellij-tab ${activeTabId === tab.id ? "active" : ""}`}
                                    draggable
                                    onDragStart={(event) =>
                                        handleTabDragStart(event, tab.id)
                                    }
                                    onDragOver={(event) =>
                                        handleTabDragOver(event, tab.id)
                                    }
                                    onDragEnd={handleTabDragEnd}
                                    onDrop={(event) => event.preventDefault()}
                                    onMouseDown={(event) =>
                                        handleTabMiddleMouseDown(event, tab.id)
                                    }
                                    onClick={() => switchTab(tab.id)}
                                    onMouseEnter={(event) =>
                                        handleTabMouseEnter(event, tab)
                                    }
                                    onMouseLeave={handleTabMouseLeave}
                                    style={{
                                        opacity: draggedTabId === tab.id ? 0.55 : 1,
                                    }}
                                >
                                    <span>{tab.title}</span>
                                    {tabs.length > 1 && (
                                        <span
                                            className="intellij-tab-close"
                                            draggable={false}
                                            onMouseDown={(event) =>
                                                event.stopPropagation()
                                            }
                                            onClick={(e) => handleCloseTab(tab.id, e)}
                                            title="Close tab"
                                        >
                                            <FiX size={13} />
                                        </span>
                                    )}
                                </div>
                            ))}

                            <button
                                className="intellij-add-btn"
                                onClick={handleAddNewTab}
                                title="Create new workflow tab"
                            >
                                <FiPlus />
                            </button>
                        </div>
                    </div>

                    {isFindOpen && (
                        <div
                            ref={findPanelRef}
                            className="nodrag nopan"
                            style={{
                                position: "fixed",
                                top: 72,
                                right: 24,
                                width: 360,
                                maxWidth: "calc(100vw - 48px)",
                                background: "#111827",
                                border: "1px solid #475569",
                                borderRadius: 8,
                                boxShadow: "0 14px 35px rgba(0, 0, 0, 0.35)",
                                zIndex: 5000,
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: 8,
                                    borderBottom: "1px solid #334155",
                                }}
                            >
                                <input
                                    ref={findInputRef}
                                    value={findQuery}
                                    onChange={(event) =>
                                        setFindQuery(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                            event.preventDefault();
                                            setIsFindOpen(false);
                                            return;
                                        }

                                        if (event.key === "ArrowDown") {
                                            event.preventDefault();
                                            if (findResults.length > 0) {
                                                setFindResultIndex((index) =>
                                                    (index + 1) % findResults.length
                                                );
                                            }
                                            return;
                                        }

                                        if (event.key === "ArrowUp") {
                                            event.preventDefault();
                                            if (findResults.length > 0) {
                                                setFindResultIndex((index) =>
                                                    (
                                                        index - 1 +
                                                        findResults.length
                                                    ) % findResults.length
                                                );
                                            }
                                            return;
                                        }

                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            focusFindResult(
                                                findResults[findResultIndex]
                                            );
                                        }
                                    }}
                                    placeholder="Find skill or slot…"
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: "8px 10px",
                                        borderRadius: 6,
                                        border: "1px solid #475569",
                                        background: "#0f172a",
                                        color: "#e2e8f0",
                                        outline: "none",
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsFindOpen(false)}
                                    title="Close (Esc)"
                                    style={{
                                        border: 0,
                                        background: "transparent",
                                        color: "#94a3b8",
                                        cursor: "pointer",
                                        padding: 4,
                                    }}
                                >
                                    <FiX size={16} />
                                </button>
                            </div>

                            {findQuery.trim() && (
                                <div
                                    style={{
                                        maxHeight: 320,
                                        overflowY: "auto",
                                        padding: 4,
                                    }}
                                >
                                    {findResults.length === 0 ? (
                                        <div
                                            style={{
                                                padding: "10px 12px",
                                                color: "#94a3b8",
                                                fontSize: 12,
                                            }}
                                        >
                                            No matching skill or slot.
                                        </div>
                                    ) : (
                                        findResults.map((result, index) => (
                                            <button
                                                key={`${result.kind}-${result.id}`}
                                                type="button"
                                                onMouseDown={(event) =>
                                                    event.preventDefault()
                                                }
                                                onClick={() =>
                                                    focusFindResult(result)
                                                }
                                                style={{
                                                    display: "flex",
                                                    width: "100%",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    padding: "8px 10px",
                                                    border: 0,
                                                    borderRadius: 5,
                                                    background:
                                                        index === findResultIndex
                                                            ? "#1e293b"
                                                            : "transparent",
                                                    color: "#e2e8f0",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: 58,
                                                        flex: "0 0 58px",
                                                        fontSize: 10,
                                                        textTransform: "uppercase",
                                                        color: "#94a3b8",
                                                    }}
                                                >
                                                    {result.kind}
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {result.label}
                                                    </div>
                                                    {result.detail &&
                                                        result.detail !==
                                                        result.label && (
                                                            <div
                                                                style={{
                                                                    overflow:
                                                                        "hidden",
                                                                    textOverflow:
                                                                        "ellipsis",
                                                                    whiteSpace:
                                                                        "nowrap",
                                                                    fontSize: 10,
                                                                    color: "#94a3b8",
                                                                }}
                                                            >
                                                                {result.detail}
                                                            </div>
                                                        )}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div
                        className="flow-container"
                        onDragOver={(e) => {
                            e.preventDefault();

                            const skill = e.dataTransfer.getData("skill");
                            if (!skill) return;

                            const pointerPosition = screenToFlowPosition({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            const hoveredCompound = nodes
                                .filter(
                                    (node) =>
                                        node.type === "compound"
                                )
                                .find((compound) => {
                                    const position = getAbsoluteNodePosition(
                                        compound,
                                        nodes
                                    );
                                    const { width, height } = getNodeSize(compound);

                                    return (
                                        pointerPosition.x >= position.x &&
                                        pointerPosition.x <= position.x + width &&
                                        pointerPosition.y >= position.y &&
                                        pointerPosition.y <= position.y + height
                                    );
                                });

                            const hoveredLane = hoveredCompound
                                ? null
                                : nodes
                                    .filter(
                                        (node) => node.type === "parallelLane"
                                    )
                                    .find((lane) => {
                                        const lanePosition =
                                            getAbsoluteNodePosition(lane, nodes);
                                        const width =
                                            Number(lane.style?.width) || 420;
                                        const height =
                                            Number(lane.style?.height) || 110;

                                        return (
                                            pointerPosition.x >= lanePosition.x &&
                                            pointerPosition.x <=
                                            lanePosition.x + width &&
                                            pointerPosition.y >= lanePosition.y &&
                                            pointerPosition.y <=
                                            lanePosition.y + height
                                        );
                                    });

                            setCompoundDropTargetId(
                                hoveredCompound?.id || null
                            );
                            setParallelDropTargetId(
                                hoveredCompound
                                    ? null
                                    : hoveredLane?.id || null
                            );
                        }}
                        onDragLeave={(e) => {
                            const rect =
                                e.currentTarget.getBoundingClientRect();

                            const actuallyLeft =
                                e.clientX <= rect.left ||
                                e.clientX >= rect.right ||
                                e.clientY <= rect.top ||
                                e.clientY >= rect.bottom;

                            if (actuallyLeft) {
                                setParallelDropTargetId(null);
                                setCompoundDropTargetId(null);
                            }
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();

                            setParallelDropTargetId(null);
                            setCompoundDropTargetId(null);

                            if (activeMode === "code") return;

                            const mousePosition = screenToFlowPosition({
                                x: e.clientX,
                                y: e.clientY,
                            });

                            const behaviorPayload =
                                e.dataTransfer.getData("behavior");

                            if (behaviorPayload) {
                                try {
                                    const behavior = JSON.parse(behaviorPayload);
                                    const newNode = await createBehaviorNode(
                                        behavior,
                                        mousePosition
                                    );
                                    const updatedNodes =
                                        resolveNodeCollisionsAndRefit(
                                            [...nodes, newNode],
                                            newNode.id
                                        );
                                    setNodes(updatedNodes);
                                    checkSlotConnection(updatedNodes);
                                } catch (error) {
                                    console.error(
                                        "Invalid behavior drag payload:",
                                        error
                                    );
                                }
                                return;
                            }

                            const skill = e.dataTransfer.getData("skill");
                            if (!skill) return;

                            const targetCompound = nodes
                                .filter(
                                    (node) =>
                                        node.type === "compound"
                                )
                                .find((compound) => {
                                    const position = getAbsoluteNodePosition(
                                        compound,
                                        nodes
                                    );
                                    const { width, height } = getNodeSize(compound);
                                    return (
                                        mousePosition.x >= position.x &&
                                        mousePosition.x <= position.x + width &&
                                        mousePosition.y >= position.y &&
                                        mousePosition.y <= position.y + height
                                    );
                                });

                            const targetLane = targetCompound
                                ? null
                                : nodes
                                    .filter(
                                        (node) => node.type === "parallelLane"
                                    )
                                    .find((lane) => {
                                        const lanePosition =
                                            getAbsoluteNodePosition(lane, nodes);
                                        const width =
                                            Number(lane.style?.width) || 420;
                                        const height =
                                            Number(lane.style?.height) || 110;

                                        return (
                                            mousePosition.x >= lanePosition.x &&
                                            mousePosition.x <=
                                            lanePosition.x + width &&
                                            mousePosition.y >= lanePosition.y &&
                                            mousePosition.y <=
                                            lanePosition.y + height
                                        );
                                    });

                            const newNode = await createNode(
                                skill.split("skills.")[1],
                                getNodeId(),
                                { x: 0, y: 0 }
                            );

                            const labelLen =
                                (newNode.data?.label || "").length +
                                (newNode.data?.fullSkillName || "").length;
                            const estimatedNodeWidth = Math.max(
                                210,
                                Math.min(300, 160 + labelLen * 3)
                            );
                            const eventCount =
                                newNode.data?.events?.length || 0;
                            const estimatedNodeHeight = Math.max(
                                70,
                                50 + eventCount * 18
                            );

                            if (targetCompound) {
                                let newX = COMPOUND_PADDING_X;

                                nodes
                                    .filter(
                                        (member) =>
                                            member.parentId ===
                                            targetCompound.id
                                    )
                                    .forEach((member) => {
                                        const size = getNodeSize(member);
                                        newX = Math.max(
                                            newX,
                                            Number(member.position?.x || 0) +
                                            size.width +
                                            COMPOUND_NODE_GAP
                                        );
                                    });

                                newNode.parentId = targetCompound.id;
                                newNode.extent = "parent";
                                newNode.position = {
                                    x: newX,
                                    y: COMPOUND_HEADER_HEIGHT,
                                };

                                setNodes((currentNodes) => {
                                    const right =
                                        newX + estimatedNodeWidth;
                                    const bottom =
                                        COMPOUND_HEADER_HEIGHT +
                                        estimatedNodeHeight;

                                    return orderNodesParentsFirst([
                                        ...currentNodes.map((candidate) =>
                                            candidate.id === targetCompound.id
                                                ? {
                                                    ...candidate,
                                                    style: {
                                                        ...candidate.style,
                                                        width: Math.max(
                                                            Number(
                                                                candidate.style
                                                                    ?.width
                                                            ) || 320,
                                                            right +
                                                            COMPOUND_PADDING_X +
                                                            getCompoundExitGutterWidth(
                                                                targetCompound.data?.events || []
                                                            )
                                                        ),
                                                        height: Math.max(
                                                            Number(
                                                                candidate.style
                                                                    ?.height
                                                            ) || 180,
                                                            bottom +
                                                            COMPOUND_BOTTOM_PADDING
                                                        ),
                                                    },
                                                }
                                                : candidate
                                        ),
                                        newNode,
                                    ]);
                                });

                                setSelectedNodeId(newNode.id);
                                return;
                            }

                            if (targetLane) {
                                const existingMembers = nodes.filter(
                                    (node) => node.parentId === targetLane.id
                                );

                                let newX = 25;
                                existingMembers.forEach((member) => {
                                    const memberWidth =
                                        Number(member.measured?.width) ||
                                        Number(member.width) ||
                                        Number(member.style?.width) ||
                                        210;
                                    newX = Math.max(
                                        newX,
                                        Number(member.position?.x || 0) +
                                        memberWidth +
                                        PARALLEL_NODE_GAP
                                    );
                                });

                                newNode.parentId = targetLane.id;
                                newNode.extent = "parent";
                                newNode.position = { x: newX, y: 20 };

                                const parallelId = targetLane.parentId;

                                setNodes((currentNodes) => {
                                    let nextNodes = [
                                        ...currentNodes,
                                        newNode,
                                    ];

                                    const parallel = nextNodes.find(
                                        (node) => node.id === parallelId
                                    );
                                    if (!parallel) {
                                        return orderNodesParentsFirst(
                                            nextNodes
                                        );
                                    }

                                    const lanes = nextNodes
                                        .filter(
                                            (node) =>
                                                node.type ===
                                                "parallelLane" &&
                                                node.parentId === parallelId
                                        )
                                        .sort(
                                            (a, b) =>
                                                Number(a.position?.y || 0) -
                                                Number(b.position?.y || 0)
                                        );

                                    let requiredParallelWidth = 420;
                                    lanes.forEach((lane) => {
                                        const members = nextNodes.filter(
                                            (node) =>
                                                node.parentId === lane.id
                                        );
                                        let maxRight = 0;

                                        members.forEach((member) => {
                                            const memberWidth =
                                                member.id === newNode.id
                                                    ? estimatedNodeWidth
                                                    : Number(
                                                        member.measured?.width
                                                    ) ||
                                                    Number(member.width) ||
                                                    Number(
                                                        member.style?.width
                                                    ) ||
                                                    210;
                                            maxRight = Math.max(
                                                maxRight,
                                                Number(
                                                    member.position?.x || 0
                                                ) + memberWidth
                                            );
                                        });

                                        requiredParallelWidth = Math.max(
                                            requiredParallelWidth,
                                            maxRight + PARALLEL_EXIT_GUTTER
                                        );
                                    });

                                    const laneLayouts = new Map();
                                    const headerHeight =
                                        lanes.length > 0
                                            ? Number(
                                                lanes[0].position?.y || 40
                                            )
                                            : 40;
                                    let currentY = headerHeight;

                                    lanes.forEach((lane) => {
                                        const members = nextNodes.filter(
                                            (node) =>
                                                node.parentId === lane.id
                                        );
                                        let maxBottom = 0;

                                        members.forEach((member) => {
                                            const memberHeight =
                                                member.id === newNode.id
                                                    ? estimatedNodeHeight
                                                    : Number(
                                                        member.measured?.height
                                                    ) ||
                                                    Number(member.height) ||
                                                    Number(
                                                        member.style?.height
                                                    ) ||
                                                    70;
                                            maxBottom = Math.max(
                                                maxBottom,
                                                Number(
                                                    member.position?.y || 0
                                                ) + memberHeight
                                            );
                                        });

                                        const requiredHeight = Math.max(
                                            110,
                                            maxBottom + 20
                                        );
                                        laneLayouts.set(lane.id, {
                                            y: currentY,
                                            height: requiredHeight,
                                        });
                                        currentY += requiredHeight;
                                    });

                                    const requiredParallelHeight =
                                        currentY + 35;

                                    nextNodes = nextNodes.map((node) => {
                                        if (node.id === parallelId) {
                                            return {
                                                ...node,
                                                style: {
                                                    ...node.style,
                                                    width: requiredParallelWidth,
                                                    height: requiredParallelHeight,
                                                },
                                            };
                                        }

                                        if (
                                            node.type === "parallelLane" &&
                                            node.parentId === parallelId
                                        ) {
                                            const layout = laneLayouts.get(
                                                node.id
                                            );
                                            if (!layout) return node;
                                            return {
                                                ...node,
                                                position: {
                                                    ...node.position,
                                                    y: layout.y,
                                                },
                                                style: {
                                                    ...node.style,
                                                    width: requiredParallelWidth,
                                                    height: layout.height,
                                                },
                                            };
                                        }

                                        return node;
                                    });

                                    return orderNodesParentsFirst(nextNodes);
                                });

                                setSelectedNodeId(newNode.id);
                                return;
                            }

                            newNode.position = {
                                x:
                                    mousePosition.x -
                                    estimatedNodeWidth / 2,
                                y:
                                    mousePosition.y -
                                    estimatedNodeHeight / 2,
                            };

                            setNodes((currentNodes) =>
                                resolveNodeCollisionsAndRefit(
                                    [...currentNodes, newNode],
                                    newNode.id
                                )
                            );
                            setSelectedNodeId(newNode.id);
                        }}
                    >
                        {activeMode === "code" ? (
                            <CodeView
                                codeString={(() => {
                                    const exportGraph = prepareGraphForScxml(nodes, edges);
                                    return generateXmlString(
                                        exportGraph.nodes,
                                        exportGraph.edges,
                                        globalDataModel
                                    );
                                })()}
                                activeMode={activeMode}
                                setActiveMode={setActiveMode}
                            />
                        ) : (
                            <>
                                <div className="mode-button-group-floating">
                                    {["event", "slots", "overview", "code"].map((m) => (
                                        <button
                                            key={m}
                                            className={`mode-button ${activeMode === m ? "active" : ""}`}
                                            onClick={() => setActiveMode(m)}
                                        >
                                            {m === "event" ? "Event Mode" : m === "slots" ? "Slot Mode" : m === "overview" ? "Overview Mode" : "Code View"}
                                        </button>
                                    ))}
                                </div>

                                {(activeMode === "slots" || activeMode === "overview") && (
                                    <button
                                        type="button"
                                        className="create-slot-button-floating"
                                        onClick={() => setIsCreateSlotModalOpen(true)}
                                    >
                                        <FiPlus /> New Slot
                                    </button>
                                )}

                                {isDraggingNode && (
                                    <div className={`trash-bin-dropzone ${isOverTrash ? "drag-over" : ""}`}>
                                        <FiTrash2 className="trash-icon" />
                                        <span>Drop here to delete</span>
                                    </div>
                                )}

                                {/* Dynamisches Kontextmenü */}
                                {contextMenu && (
                                    <div
                                        className="context-menu"
                                        style={{ top: contextMenu.y, left: contextMenu.x }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="context-menu-header">
                                            {selectedNodes.length > 0
                                                ? `change ${selectedNodes.length} node(s) in:`
                                                : "Create new element"}
                                        </div>
                                        <button className="context-menu-item" onClick={() => handleSelectAction("compound")}>
                                            Compound State
                                        </button>
                                        <button className="context-menu-item" onClick={() => handleSelectAction("parallel")}>
                                            Parallel State
                                        </button>
                                        <button className="context-menu-item" onClick={() => handleSelectAction("submachine")}>
                                            Sub-State-Machine
                                        </button>
                                        {(activeMode === "slots" || activeMode === "overview") && (
                                            <button className="context-menu-item" onClick={() => handleSelectAction("slot")}>
                                                Slot
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* ReactFlow mit Strg-Support */}
                                <SmartEdgeProvider nodes={visibleNodes}>
                                    <ReactFlow
                                        nodes={visibleNodes}
                                        edges={visibleEdges}
                                        onNodesChange={handleNodesChange}
                                        onEdgesChange={handleVisibleEdgesChange}
                                        onConnect={onConnect}
                                        onConnectStart={handleConnectStart}
                                        onConnectEnd={handleConnectEnd}
                                        isValidConnection={isValidConnection}
                                        connectionMode={ConnectionMode.Loose}
                                        onEdgeClick={(_, edge) => {
                                            if (
                                                edge.data?.compoundInitialEdge ||
                                                edge.data?.parallelEntryEdge
                                            ) {
                                                return;
                                            }
                                            if (isSlotEdge(edge)) {
                                                selectSlotEdge(edge.id);
                                                return;
                                            }
                                            selectTransitionEdge(edge.id);
                                        }}
                                        onEdgeDoubleClick={(event, edge) => {
                                            if (
                                                edge.data?.compoundInitialEdge ||
                                                edge.data?.parallelEntryEdge
                                            ) {
                                                return;
                                            }
                                            if (isSlotEdge(edge)) {
                                                selectSlotEdge(edge.id);
                                                return;
                                            }
                                            onEdgeDoubleClick(event, edge);
                                        }}
                                        nodeTypes={nodeTypes}
                                        edgeTypes={edgeTypes}
                                        onNodeClick={(_, n) => {
                                            clearAllEdgeSelection();
                                            if (n.type === "parallelLane" && n.parentId) {
                                                setSelectedNodeId(n.parentId);
                                                setActiveTab("allgemein");
                                                return;
                                            }

                                            setSelectedNodeId(n.id);

                                            if (n.type === "slot") {
                                                setRightPanelTab("details");
                                                return;
                                            }

                                            setRightPanelTab("details");
                                        }}
                                        onNodeMouseEnter={(_, n) => {
                                            setHoveredEditorEdgeId(null);
                                            setHoveredEditorNodeId(n.id);
                                        }}
                                        onNodeMouseLeave={(_, n) => {
                                            setHoveredEditorNodeId((current) =>
                                                current === n.id ? null : current
                                            );
                                        }}
                                        onEdgeMouseEnter={(_, edge) => {
                                            setHoveredEditorNodeId(null);
                                            setHoveredEditorEdgeId(edge.id);
                                        }}
                                        onEdgeMouseLeave={(_, edge) => {
                                            setHoveredEditorEdgeId((current) =>
                                                current === edge.id ? null : current
                                            );
                                        }}
                                        onPaneClick={() => {
                                            clearAllEdgeSelection();
                                            setSelectedNodeId(null);
                                            setRightPanelTab("datamodel");
                                        }}
                                        onPaneContextMenu={(e) => handleContextMenuOpen(e)}
                                        onNodeContextMenu={(e, node) => handleContextMenuOpen(e, node)}
                                        multiSelectionKeyCode={["Control", "Meta"]}
                                        selectionKeyCode={["Control", "Meta"]}
                                        deleteKeyCode={["Delete"]}
                                        minZoom={0.08}
                                        onNodeDoubleClick={(_, n) => {
                                            if (n.type === "submachine" && n.data?.src) {
                                                handleOpenSubMachine(n.data.src, n.data.label);
                                            }
                                        }}
                                        onNodeDragStart={handleNodeDragStart}
                                        onNodeDrag={handleNodeDrag}
                                        onNodeDragStop={handleNodeDragStop}
                                    >
                                        <Background />
                                        <Controls />
                                    </ReactFlow>
                                </SmartEdgeProvider>
                            </>
                        )}
                    </div>
                </main>

                <div className="right-panel-shell">
                    <div className="right-panel-tabs">
                        <button
                            type="button"
                            className={`right-panel-tab ${rightPanelTab === "datamodel" ? "active" : ""}`}
                            onClick={() => setRightPanelTab("datamodel")}
                        >
                            Datamodel
                        </button>

                        {selectedNode && (
                            <button
                                type="button"
                                className={`right-panel-tab ${rightPanelTab === "details" ? "active" : ""}`}
                                onClick={() => setRightPanelTab("details")}
                            >
                                {selectedNode.type === "slot" ? "Slot Details" : "Skill Detail"}
                            </button>
                        )}

                        <button
                            type="button"
                            className={`right-panel-tab ${rightPanelTab === "problems" ? "active" : ""}`}
                            onClick={() => setRightPanelTab("problems")}
                        >
                            <span>Problems</span>
                            {editorProblems.length > 0 && (
                                <span
                                    className={`right-panel-problem-count ${
                                        errorProblemCount > 0
                                            ? "has-errors"
                                            : "warnings-only"
                                    }`}
                                >
                                    {editorProblems.length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="right-panel-content">
                        {rightPanelTab === "datamodel" && (
                            <WorkflowPanel
                                globalDataModel={globalDataModel}
                                inheritedGlobalDataModel={inheritedGlobalDataModel}
                                descendantGlobalDataModel={descendantGlobalDataModel}
                                newParamId={newParamId}
                                setNewParamId={setNewParamId}
                                newParamExpr={newParamExpr}
                                setNewParamExpr={setNewParamExpr}
                                onUpdateGlobalParam={(index, value) => {
                                    setGlobalDataModel((prev) =>
                                        prev.map((param, i) =>
                                            i === index
                                                ? { ...param, expr: value }
                                                : param
                                        )
                                    );
                                }}
                                onAddParameter={(parameterId, parameterExpr) => {
                                    const normalizedId = parameterId.trim();
                                    if (!normalizedId) return;

                                    setGlobalDataModel((prev) => {
                                        if (
                                            prev.some(
                                                (parameter) =>
                                                    parameter.id === normalizedId
                                            )
                                        ) {
                                            return prev;
                                        }

                                        return [
                                            ...prev,
                                            {
                                                id: normalizedId,
                                                expr: parameterExpr,
                                            },
                                        ];
                                    });

                                    setNewParamId("");
                                    setNewParamExpr("");
                                }}
                                onDeleteParameter={(index) => {
                                    setGlobalDataModel((prev) =>
                                        prev.filter((_, i) => i !== index)
                                    );
                                }}
                            />
                        )}

                        {rightPanelTab === "problems" && (
                            <ProblemsPanel
                                problems={editorProblems}
                                onProblemClick={handleProblemClick}
                            />
                        )}

                        {rightPanelTab === "details" && selectedNode && (
                            <DetailsPanel
                                selectedNode={selectedNode}
                                hasInitialNode={hasInitialNode}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                packages={packages}
                                getPackageSkillEvent={getPackageSkillEvent}
                                onSetInitial={() =>
                                    setNodes((nds) => {
                                        const parentId =
                                            selectedNode.parentId || null;

                                        const parentCompound =
                                            parentId
                                                ? nds.find(
                                                    (node) =>
                                                        node.id ===
                                                        parentId &&
                                                        node.type ===
                                                        "compound"
                                                )
                                                : null;

                                        return nds.map((node) => {
                                            if (
                                                parentCompound &&
                                                node.id ===
                                                parentCompound.id
                                            ) {
                                                return {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        initialChildId:
                                                        selectedNode.id,
                                                    },
                                                };
                                            }

                                            if (
                                                (node.parentId || null) !==
                                                parentId
                                            ) {
                                                return node;
                                            }

                                            if (
                                                node.type === "slot" ||
                                                node.type ===
                                                "parallelLane"
                                            ) {
                                                return node;
                                            }

                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    isInitial:
                                                        node.id ===
                                                        selectedNode.id,
                                                },
                                            };
                                        });
                                    })
                                }
                                onUpdateName={(name) =>
                                    setNodes((nds) =>
                                        nds.map((n) => {
                                            if (n.id !== selectedNode.id) return n;

                                            const isContainerOrSub =
                                                n.type === "compound" ||
                                                n.type === "parallel" ||
                                                n.type === "submachine";

                                            if (isContainerOrSub) {
                                                return {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        label: name,
                                                        fullSkillName: name,
                                                    },
                                                };
                                            }

                                            const skillType = String(
                                                n.data?.fullSkillName || ""
                                            )
                                                .split("#")[0]
                                                .split(".")
                                                .pop()
                                                .toLowerCase();

                                            // End, Fatal and forwarding Nop clones use an
                                            // editor-only instance ID. Renaming that ID must
                                            // never modify the underlying skill/SCXML identity.
                                            if (["nop", "fatal", "end"].includes(skillType)) {
                                                return {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        editorInstanceId: name,
                                                        fullSkillName:
                                                            n.data?.fullSkillName?.split("#")[0] ||
                                                            n.data?.fullSkillName,
                                                    },
                                                };
                                            }

                                            return {
                                                ...n,
                                                data: {
                                                    ...n.data,
                                                    label: name,
                                                    fullSkillName: `${n.data.fullSkillName?.split("#")[0]}#${name}`,
                                                },
                                            };
                                        })
                                    )
                                }
                                onUpdateSrc={(nodeId, newSrc) =>
                                    setNodes((nds) =>
                                        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, src: newSrc } } : n))
                                    )
                                }
                                onUpdateEvent={updateNodeEvent}
                                availableTargetNodes={nodes}
                                onSetEventTarget={setExistingTargetForEvent}
                                onUpdateParameter={(idx, val) => {
                                    const nextParams = (selectedNode.data?.params || []).map(
                                        (parameter, i) =>
                                            i === idx
                                                ? { ...parameter, expr: val }
                                                : parameter
                                    );

                                    setNodes((nds) =>
                                        nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        params: nextParams,
                                                    },
                                                }
                                                : n
                                        )
                                    );

                                    // Clearing a parameter changes the configured
                                    // skill just as adding one does. Refresh right
                                    // away and pass the new parameter list explicitly
                                    // so the request cannot see stale React state.
                                    if (String(val ?? "").trim() === "") {
                                        updateEventsFromParameters(
                                            selectedNode.id,
                                            nextParams
                                        );
                                    }
                                }}

                                onUpdateParameterBlur={updateEventsFromParameters}
                                globalDataModel={selectedActionDataModel}
                                actionValueVariables={selectedActionExpressionVariables}
                                onUpdateStateActions={(nodeId, actionType, assignments) =>
                                    setNodes((nds) =>
                                        nds.map((node) =>
                                            node.id === nodeId
                                                ? {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        [actionType]: assignments,
                                                    },
                                                }
                                                : node
                                        )
                                    )
                                }
                                onUpdateSendEvents={(nodeId, events) => {
                                    const sourceNode = nodes.find((node) => node.id === nodeId);
                                    if (!sourceNode) return;

                                    const nextEvent = Array.isArray(events)
                                        ? String(events[0] ?? "")
                                        : "";
                                    const nextEvents = nextEvent ? [nextEvent] : [];
                                    const nonEmptyEvents = nextEvent.trim()
                                        ? [nextEvent.trim()]
                                        : [];
                                    const currentTransitions = Array.isArray(
                                        sourceNode.data?.behaviorExitTransitions
                                    )
                                        ? sourceNode.data.behaviorExitTransitions
                                        : [];
                                    const triggerEvent =
                                        currentTransitions[0]?.triggerEvent || "Nop.fatal";
                                    const sharedScxmlStateId = String(
                                        sourceNode.data?.scxmlStateId ||
                                        sourceNode.data?.behaviorExitScxmlStateId ||
                                        ""
                                    ).trim();

                                    const isSameSharedNop = (node) => {
                                        if (node.type !== "custom") return false;
                                        const baseName = String(
                                            node.data?.fullSkillName || ""
                                        )
                                            .split("#")[0]
                                            .split(".")
                                            .pop()
                                            .toLowerCase();
                                        if (baseName !== "nop") return false;
                                        if (!sharedScxmlStateId) {
                                            return node.id === nodeId;
                                        }
                                        const candidateSharedId = String(
                                            node.data?.scxmlStateId ||
                                            node.data?.behaviorExitScxmlStateId ||
                                            ""
                                        ).trim();
                                        return candidateSharedId === sharedScxmlStateId;
                                    };

                                    const sharedNopIds = new Set(
                                        nodes.filter(isSameSharedNop).map((node) => node.id)
                                    );

                                    // Once a Nop sends an event it becomes an outward forwarding
                                    // state. Ordinary SCXML transitions are mutually exclusive
                                    // with that behavior, so remove them from every visual clone.
                                    if (nonEmptyEvents.length > 0) {
                                        setEdges((currentEdges) =>
                                            currentEdges.filter(
                                                (edge) =>
                                                    !sharedNopIds.has(edge.source) ||
                                                    isSlotEdge(edge)
                                            )
                                        );
                                    }

                                    setNodes((nds) =>
                                        nds.map((node) => {
                                            if (!isSameSharedNop(node)) return node;

                                            const clearedEvents =
                                                nonEmptyEvents.length > 0
                                                    ? (node.data?.events || []).map((event) => ({
                                                        ...event,
                                                        target: null,
                                                        cond: "",
                                                        assignments: [],
                                                        assign: null,
                                                        assignLocation: "",
                                                        assignExpr: "",
                                                        selectedPackage: "",
                                                        selectedSkill: "",
                                                    }))
                                                    : node.data?.events;

                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    ...(nonEmptyEvents.length > 0
                                                        ? { events: clearedEvents }
                                                        : {}),
                                                    ...(nonEmptyEvents.length > 0
                                                        ? { onEntry: [], onExit: [] }
                                                        : {}),
                                                    isBehaviorExit: nextEvents.length > 0,
                                                    behaviorExitEvents: nextEvents,
                                                    behaviorExitTransitions:
                                                        nextEvents.length > 0
                                                            ? [
                                                                {
                                                                    triggerEvent,
                                                                    sendEvents: nextEvents,
                                                                },
                                                            ]
                                                            : [],
                                                    label:
                                                        nonEmptyEvents.length > 0
                                                            ? nonEmptyEvents.join(", ")
                                                            : "Nop",
                                                    ...(nextEvents.length > 0
                                                        ? (() => {
                                                            const nextScxmlStateId =
                                                                getForwardingNopScxmlStateId(
                                                                    node,
                                                                    nextEvents[0]
                                                                );
                                                            return {
                                                                behaviorExitScxmlStateId:
                                                                nextScxmlStateId,
                                                                scxmlStateId:
                                                                nextScxmlStateId,
                                                            };
                                                        })()
                                                        : {}),
                                                },
                                            };
                                        })
                                    );
                                }}
                                onUpdateInSlotPath={(idx, val, commit = false) =>
                                    setNodes((nds) => {
                                        const updatedNodes = nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        inSlots: n.data.inSlots.map((s, i) =>
                                                            i === idx
                                                                ? { ...s, path: val }
                                                                : s
                                                        ),
                                                    },
                                                }
                                                : n
                                        );

                                        if (commit) {
                                            requestAnimationFrame(() =>
                                                checkSlotConnection(updatedNodes)
                                            );
                                        }

                                        return updatedNodes;
                                    })
                                }
                                onUpdateOutSlotPath={(idx, val, commit = false) =>
                                    setNodes((nds) => {
                                        const updatedNodes = nds.map((n) =>
                                            n.id === selectedNode.id
                                                ? {
                                                    ...n,
                                                    data: {
                                                        ...n.data,
                                                        outSlots: n.data.outSlots.map((s, i) =>
                                                            i === idx
                                                                ? { ...s, path: val }
                                                                : s
                                                        ),
                                                    },
                                                }
                                                : n
                                        );

                                        if (commit) {
                                            requestAnimationFrame(() =>
                                                checkSlotConnection(updatedNodes)
                                            );
                                        }

                                        return updatedNodes;
                                    })
                                }
                                onCheckSlots={checkSlotConnection}
                                availableSlotPaths={canvasSlotPathOptions}
                                slotDetails={selectedSlotDetails}
                                onUpdateSlotPath={handleUpdateSelectedSlotPath}
                                onUpdateSlotInherited={handleUpdateSelectedSlotInherited}
                                onHoverSlotAccessSkill={(nodeId) =>
                                    setHoveredSlotAccessNodeId(nodeId || null)
                                }
                                onSelectSlotAccessSkill={(nodeId) => {
                                    if (!nodeId) return;

                                    setHoveredSlotAccessNodeId(null);
                                    clearAllEdgeSelection();
                                    setNodes((currentNodes) =>
                                        currentNodes.map((node) => ({
                                            ...node,
                                            selected: node.id === nodeId,
                                        }))
                                    );
                                    setSlotNodes((currentNodes) =>
                                        currentNodes.map((node) => ({
                                            ...node,
                                            selected: false,
                                        }))
                                    );
                                    setSelectedNodeId(nodeId);
                                    setRightPanelTab("details");

                                    window.setTimeout(() => {
                                        fitView({
                                            nodes: [{ id: nodeId }],
                                            padding: 0.8,
                                            maxZoom: 1.35,
                                            duration: 250,
                                        });
                                    }, 0);
                                }}
                                parameterFocusRequest={parameterFocusRequest}
                                slotFocusRequest={slotFocusRequest}
                                transitionFocusRequest={transitionFocusRequest}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div
                className="nodrag nopan"
                onMouseEnter={() => setIsShortcutHelpOpen(true)}
                onMouseLeave={() => setIsShortcutHelpOpen(false)}
                onFocusCapture={() => setIsShortcutHelpOpen(true)}
                onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                        setIsShortcutHelpOpen(false);
                    }
                }}
                style={{
                    position: "fixed",
                    right: 18,
                    bottom: 18,
                    zIndex: 5200,
                }}
            >
                {isShortcutHelpOpen && (
                    <div
                        role="tooltip"
                        style={{
                            position: "absolute",
                            right: 0,
                            bottom: 44,
                            width: 360,
                            maxWidth: "calc(100vw - 36px)",
                            maxHeight: "min(650px, calc(100vh - 90px))",
                            overflowY: "auto",
                            padding: 12,
                            border: "1px solid #475569",
                            borderRadius: 9,
                            background: "#111827",
                            color: "#e2e8f0",
                            boxShadow: "0 14px 35px rgba(0, 0, 0, 0.38)",
                            fontSize: 12,
                            pointerEvents: "auto",
                        }}
                    >
                        <div
                            style={{
                                marginBottom: 9,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#f8fafc",
                            }}
                        >
                            Keyboard shortcuts
                        </div>

                        {EDITOR_SHORTCUTS.map((shortcut) => (
                            <div
                                key={shortcut.keys}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "145px 1fr",
                                    alignItems: "center",
                                    gap: 10,
                                    minHeight: 28,
                                }}
                            >
                                <kbd
                                    style={{
                                        justifySelf: "start",
                                        padding: "3px 6px",
                                        border: "1px solid #475569",
                                        borderBottomColor: "#64748b",
                                        borderRadius: 5,
                                        background: "#0f172a",
                                        color: "#cbd5e1",
                                        fontFamily: "inherit",
                                        fontSize: 10,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {shortcut.keys}
                                </kbd>
                                <span style={{ color: "#cbd5e1" }}>
                                    {shortcut.action}
                                </span>
                            </div>
                        ))}

                        <div
                            style={{
                                margin: "8px 0 5px",
                                paddingTop: 8,
                                borderTop: "1px solid #334155",
                                color: "#94a3b8",
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                            }}
                        >
                            In search
                        </div>

                        {FIND_SHORTCUTS.map((shortcut) => (
                            <div
                                key={shortcut.keys}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "145px 1fr",
                                    alignItems: "center",
                                    gap: 10,
                                    minHeight: 26,
                                }}
                            >
                                <kbd
                                    style={{
                                        justifySelf: "start",
                                        padding: "3px 6px",
                                        border: "1px solid #475569",
                                        borderRadius: 5,
                                        background: "#0f172a",
                                        color: "#cbd5e1",
                                        fontFamily: "inherit",
                                        fontSize: 10,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {shortcut.keys}
                                </kbd>
                                <span style={{ color: "#cbd5e1" }}>
                                    {shortcut.action}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    aria-label="Show keyboard shortcuts"
                    aria-expanded={isShortcutHelpOpen}
                    title="Keyboard shortcuts"
                    style={{
                        width: 34,
                        height: 34,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #475569",
                        borderRadius: 8,
                        background: "#111827",
                        color: "#cbd5e1",
                        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
                        cursor: "help",
                        fontSize: 18,
                        lineHeight: 1,
                    }}
                >
                    ⌨
                </button>
            </div>

            {tabPathTooltip &&
                createPortal(
                    <div
                        className="workflow-tab-path-tooltip"
                        style={{
                            left: tabPathTooltip.left,
                            top: tabPathTooltip.top,
                        }}
                    >
                        {tabPathTooltip.path}
                    </div>,
                    document.body
                )}

            <ConditionModal
                isOpen={drawerData.isOpen}
                onClose={() => {
                    setDrawerData((prev) => ({ ...prev, isOpen: false }));
                    clearTransitionSelection();
                }}
                onConfirm={handleConfirmDrawer}
                globalVariables={availableDataModelParameters}
                sourceNodeName={drawerData.sourceNodeName}
                sourceEventName={drawerData.sourceEventName}
                candidateTransitions={drawerData.candidateTransitions}
                availableEvents={drawerData.availableEvents}
                availableTargets={drawerData.availableTargets}
                initialTransitionId={drawerData.initialTransitionId}
                initialTargetId={drawerData.initialTargetId}
            />

            <CreateSlotModal
                isOpen={isCreateSlotModalOpen}
                onClose={() => setIsCreateSlotModalOpen(false)}
                onCreate={handleCreateManualSlot}
                skillSlotOptions={canvasSkillSlotOptions}
            />
        </div>
    );
}

export default function App() {
    return (
        <ReactFlowProvider>
            <AppContent />
        </ReactFlowProvider>
    );
}

