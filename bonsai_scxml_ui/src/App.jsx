import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FiTrash2, FiPlus, FiX } from "react-icons/fi";
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    MarkerType,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Ausgelagerte Komponenten
import CustomNode from "./components/CustomNode";
import SlotNode from "./components/SlotNode";
import ParallelNode from "./components/ParallelNode";
import SubMachineNode from "./components/SubMachineNode";
import Header from "./components/Header";
import SkillLibrary from "./components/SkillLibrary";
import DetailsPanel from "./components/DetailsPanel";
import WorkflowPanel from "./components/WorkflowPanel";
import CodeView from "./components/CodeView";
import ConditionModal from "./components/ConditionModal";
import CompoundNode from "./components/CompoundNode";
import ParallelLaneNode from "./components/ParallelLaneNode";

// Ausgelagerte Utils (saveScxmlFile statt exportScxmlFile)
import { generateXmlString, saveScxmlFile, saveScxmlFileTauri, openScxmlFileTauri, readScxmlFileContent } from "./utils/scxmlExport";
import { parseScxmlFile } from "./utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "./config/prefixMapping";
import { isTauri, initApiProxy } from "./tauri-client.js";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();

const nodeTypes = { custom: CustomNode, slot: SlotNode, submachine: SubMachineNode, parallel: ParallelNode, compound: CompoundNode, parallelLane: ParallelLaneNode, };
const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();


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

function AppContent() {
    const [skills, setSkills] = useState({ skills: [] });
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [selectedSubPackage, setSelectedSubPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Everything");
    const [searchText, setSearchText] = useState("");
    const [contextMenu, setContextMenu] = useState(null);

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

    const [activeMode, setActiveMode] = useState("event");
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [activeTab, setActiveTab] = useState("allgemein");
    const [rightPanelTab, setRightPanelTab] = useState("datamodel");

    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isOverTrash, setIsOverTrash] = useState(false);

    const [globalDataModel, setGlobalDataModel] = useState([
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
        { id: "Test: globales Datamodel", expr: "testen" },
    ]);
    const [inheritedGlobalDataModel, setInheritedGlobalDataModel] = useState([]);
    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");

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

    const { screenToFlowPosition, fitView } = useReactFlow();

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

    const handleAddNewTab = () => {
        const updatedCurrent = tabs.map((t) =>
            t.id === activeTabId
                ? {
                    ...t,
                    nodes,
                    edges,
                    slotNodes,
                    slotEdges,
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
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel([]);
        setSelectedNodeId(null);
    };

    const handleCloseTab = (tabIdToClose, e) => {
        e.stopPropagation();
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
            setGlobalDataModel(fallbackTab.globalDataModel || []);
            setInheritedGlobalDataModel(
                fallbackTab.inheritedGlobalDataModel || []
            );
            setSelectedNodeId(null);
        }
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
        const compoundName = `Compound_${nodes.filter((n) => n.type === "compound").length + 1}`;

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

        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(compoundId); // <-- Details-Panel direkt öffnen
        setActiveTab("allgemein");
        setContextMenu(null);
    };

    const handleAddLaneToParallel = useCallback((parallelId) => {
        setNodes((nds) => {
            const parallelNode = nds.find((n) => n.id === parallelId);
            if (!parallelNode) return nds;

            const existingLanes = nds.filter((n) => n.parentId === parallelId && n.type === "parallelLane");
            const laneIndex = existingLanes.length;
            const laneHeight = 140; // <-- auf 140px erhöht
            const headerHeight = 45;
            const buttonReserve = 35;

            const newLaneId = getNodeId();
            const newLaneName = `Lane_${laneIndex + 1}`;
            const containerWidth = parallelNode.style?.width || 420;

            const newLaneNode = {
                id: newLaneId,
                position: { x: 0, y: headerHeight + laneIndex * laneHeight },
                parentId: parallelId,
                extent: "parent",
                type: "parallelLane",
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom: "1.5px solid #0284c7",
                },
                data: {
                    label: newLaneName,
                    events: [],
                },
            };

            const newTotalHeight = headerHeight + (laneIndex + 1) * laneHeight + buttonReserve;

            return nds.map((n) => {
                if (n.id === parallelId) {
                    return {
                        ...n,
                        style: { ...n.style, height: newTotalHeight },
                        data: {
                            ...n.data,
                            lanes: [...(n.data.lanes || []), newLaneName],
                        },
                    };
                }
                return n;
            }).concat(newLaneNode);
        });
    }, [setNodes]);

    const handleCreateEmptyParallel = (pos) => {
        const parallelId = getNodeId();
        const parallelName = `Parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;
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
            type: "parallelLane",
            style: { width: containerWidth, height: laneHeight, borderBottom: "1.5px solid #0284c7" },
            data: { label: "Lane_1", events: [] },
        };

        const lane2 = {
            id: getNodeId(),
            position: { x: 0, y: headerHeight + laneHeight },
            parentId: parallelId,
            extent: "parent",
            type: "parallelLane",
            style: { width: containerWidth, height: laneHeight, borderBottom: "none" },
            data: { label: "Lane_2", events: [] },
        };

        setNodes((nds) => [...nds, parallelNode, lane1, lane2]);
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
                src: `\${EXERCISE}/${subMachineLabel}.xml`,
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

    const handleOpenSubMachine = async (srcPath, label) => {
        if (!srcPath) return;

        const resolvedUrl = resolveSrcPath(srcPath, DEFAULT_PREFIX_CONFIG);
        const fileName = srcPath.split("/").pop();
        const baseName = fileName.replace(/\.(xml|scxml)$/i, "");
        const tabId = `tab-sub-${baseName}`;

        const existingTab = tabs.find((t) => t.id === tabId);
        if (existingTab) {
            switchTab(tabId);
            return;
        }

        try {
            const response = await fetch(resolvedUrl);
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status} (${response.statusText})`);
            }

            const xmlText = await response.text();
            if (!xmlText || !xmlText.includes("<scxml")) {
                throw new Error("Response does not contain a valid <scxml> document.");
            }

            const parsed = await parseScxmlFile(xmlText, fetchSkillData, getNodeId);

            const currentTab = tabs.find((tab) => tab.id === activeTabId);
            const inheritedForChild = buildInheritedGlobalsForChild(
                inheritedGlobalDataModel,
                globalDataModel,
                currentTab?.title || currentTab?.fileName || "Parent"
            );

            const newTabObj = {
                id: tabId,
                title: label || baseName,
                fileName: fileName,
                fileHandle: null,
                sourcePath: srcPath,
                nodes: parsed.nodes,
                edges: parsed.edges,
                slotNodes: [],
                slotEdges: [],
                parentTabId: activeTabId,
                inheritedGlobalDataModel: inheritedForChild,
                globalDataModel: parsed.globalDataModel,
            };

            setTabs((prev) => [
                ...prev.map((t) =>
                    t.id === activeTabId
                        ? {
                            ...t,
                            nodes,
                            edges,
                            slotNodes,
                            slotEdges,
                            globalDataModel,
                            inheritedGlobalDataModel,
                        }
                        : t
                ),
                newTabObj,
            ]);

            setActiveTabId(tabId);
            setNodes(parsed.nodes);
            setEdges(parsed.edges);
            setGlobalDataModel(parsed.globalDataModel);
            setInheritedGlobalDataModel(inheritedForChild);
            setSelectedNodeId(null);
            checkSlotConnection(parsed.nodes);
            setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
        } catch (err) {
            console.error("Sub-Machine loading error:", err);
            alert(`Error automatically loading the sub-machine:\n${err.message}\n\nURL retrieved: ${resolvedUrl}`);
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

        const { minX, minY, maxX, maxY } = getSelectionBoundingBox(selectedNodes);
        const padding = 40;
        const headerOffset = 50;

        const containerWidth = Math.max(260, maxX - minX + padding * 2);
        const containerHeight = Math.max(160, maxY - minY + padding * 2 + headerOffset);

        const compoundId = getNodeId();
        const compoundName = `Compound_${nodes.filter((n) => n.type === "compound").length + 1}`;

        const compoundNode = {
            id: compoundId,
            type: "compound",
            position: { x: minX - padding, y: minY - padding - headerOffset },
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: compoundName,
                fullSkillName: compoundName,
                isInitial: selectedNodes.some((n) => n.data?.isInitial),
                events: [],
                onEntry: [],
                onExit: [],
            },
        };

        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const updatedNodes = nodes.map((node) => {
            if (selectedIds.has(node.id)) {
                return {
                    ...node,
                    parentId: compoundId,
                    extent: "parent",
                    position: {
                        x: node.position.x - (minX - padding),
                        y: node.position.y - (minY - padding - headerOffset),
                    },
                    selected: false,
                };
            }
            return node;
        });

        setNodes([compoundNode, ...updatedNodes]);
        setSelectedNodeId(compoundId);
        setActiveTab("allgemein");
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
                groupWidths.push(getNodeWidth(group[0]) + 160); // Platz für Exit-Labels
            }
        });

        // Der Gesamt-Container muss so breit sein wie die breiteste Gruppe (mind. 480px)
        const containerWidth = Math.max(480, ...groupWidths);
        const totalLanesHeight = laneHeights.reduce((sum, h) => sum + h, 0);
        const containerHeight = headerHeight + totalLanesHeight + buttonReserve;

        const { minX, minY } = getSelectionBoundingBox(selectedNodes);
        const parallelId = getNodeId();
        const parallelName = `Parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;

        const branchNames = groups.map((g, idx) => {
            if (g.length > 1) return `Group_${idx + 1}`;
            return g[0].data?.label || `Lane_${idx + 1}`;
        });

        const parallelNode = {
            id: parallelId,
            type: "parallel",
            position: { x: minX - 30, y: minY - 30 - headerHeight },
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: parallelName,
                fullSkillName: parallelName,
                isInitial: selectedNodes.some((n) => n.data?.isInitial),
                lanes: branchNames,
                events: [],
                onAddLane: handleAddLaneToParallel,
                onEntry: [],
                onExit: [],
            },
        };

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
            const isCompound = group.length > 1;

            group.forEach((n) => nodeToLaneMap.set(n.id, laneId));

            newLanes.push({
                id: laneId,
                position: { x: 0, y: currentLaneY },
                parentId: parallelId,
                extent: "parent",
                draggable: false,
                selectable: false,
                type: "parallelLane",
                style: {
                    width: containerWidth,
                    height: laneHeight,
                    borderBottom: idx < groups.length - 1 ? "1.5px solid #0284c7" : "none",
                },
                data: {
                    label: laneName,
                    events: [],
                },
            });

            if (isCompound) {
                const compoundId = getNodeId();
                const compoundName = `${laneName}_Part`;
                const compoundWidth = containerWidth - 130;
                const compoundHeight = laneHeight - 10;

                newCompounds.push({
                    id: compoundId,
                    position: { x: 15, y: 5 },
                    parentId: laneId,
                    extent: "parent",
                    type: "compound",
                    className: "compound-in-lane", // <-- Macht den Rahmen unsichtbar
                    style: { width: compoundWidth, height: compoundHeight },
                    data: {
                        label: compoundName,
                        fullSkillName: compoundName,
                        isInitial: group.some((n) => n.data?.isInitial),
                        events: [],
                    },
                });

                // Nodes horizontal nacheinander platzieren
                let currentX = 15;
                group.forEach((node) => {
                    const w = getNodeWidth(node);
                    movedNodes.push({
                        ...node,
                        parentId: compoundId,
                        extent: "parent",
                        position: { x: currentX, y: 15 }, // <-- Weiter oben, da kein Header stört
                        selected: false,
                    });
                    currentX += w + 35;
                });
            } else {
                movedNodes.push({
                    ...group[0],
                    parentId: laneId,
                    extent: "parent",
                    position: { x: 25, y: 20 },
                    selected: false,
                });
            }

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
                    type: "smoothstep",
                });

                return {
                    ...edge,
                    source: laneId,
                    sourceHandle: handleId,
                };
            }

            return edge;
        });

        let insertIndex = nodes.findIndex((n) => selectedIds.has(n.id));
        if (insertIndex === -1) insertIndex = 0;

        const remainingNodes = nodes.filter((n) => {
            if (selectedIds.has(n.id)) return false;
            if (n.type === "compound") {
                const hasRemainingChildren = nodes.some(
                    (child) => child.parentId === n.id && !selectedIds.has(child.id)
                );
                return hasRemainingChildren;
            }
            return true;
        });

        const newRootNodes = [...remainingNodes];
        newRootNodes.splice(insertIndex, 0, parallelNode);

        setNodes([...newRootNodes, ...newLanes, ...newCompounds, ...movedNodes]);
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
                src: `\${EXERCISE}/${subMachineLabel}.xml`,
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
        setGlobalDataModel(newTabObj.globalDataModel);
        setInheritedGlobalDataModel(inheritedForChild);
        setSelectedNodeId(null);

// Slot-Verbindungen des neuen Tabs berechnen & View zentrieren
        checkSlotConnection(subTabNodes);
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    };

    const injectedNodes = useMemo(() => {
        return nodes.map((n) => {
            if (n.type === "submachine") {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        onOpenSubMachine: handleOpenSubMachine,
                    },
                };
            }

            if (n.type === "parallel") {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        onAddLane: handleAddLaneToParallel,
                    },
                };
            }

            return n;
        });
    }, [nodes, tabs, activeTabId, handleAddLaneToParallel]);

    useEffect(() => {
        const fetchSkills = async () => {
            try {
                const response = await fetch("/api/skills");
                const data = await response.json();
                setSkills(data);
            } catch (error) {
                console.error("Error loading skills:", error);
            }
        };
        fetchSkills();
    }, []);

    const fetchSkillData = async (fullSkillName) => {
        try {
            const response = await fetch(`/api/skill/${fullSkillName}`);
            return await response.json();
        } catch (error) {
            return null;
        }
    };

    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
    const hasInitialNode = nodes.some((node) => node.data?.isInitial);

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


    let visibleNodes = injectedNodes;
    let visibleEdges = edges;
    if (activeMode === "slots") {
        visibleNodes = [...injectedNodes, ...slotNodes];
        visibleEdges = slotEdges;
    } else if (activeMode === "both") {
        visibleNodes = [...injectedNodes, ...slotNodes];
        visibleEdges = [...edges, ...slotEdges];
    }

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
        return {
            id: nodeid,
            position,
            type: "custom",
            data: {
                label: selectedSkill.split(".").pop(),
                fullSkillName: createNameforSkill(selectedSkill),
                description: data.description || "",
                isInitial: false,
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
                })),

                outSlots: (data.outSlots || []).map((s) => ({
                    key: s.key,
                    type: s.type,
                    description: s.description || "",
                    path: "",
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

        const availableTargets = nodes.map((node) => {
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

    const onConnect = useCallback(
        (params) => {
            const alreadyExists = edges.some(
                (e) => e.source === params.source && e.sourceHandle === params.sourceHandle && e.target === params.target
            );

            if (alreadyExists) {
                openConditionDrawer(params.source, params.sourceHandle, params.target);
                return;
            }

            const targetNode = nodes.find((n) => n.id === params.target);
            const newEdge = {
                id: `edge-${params.source}-${params.sourceHandle}-${params.target}-${crypto.randomUUID()}`,
                source: params.source,
                target: params.target,
                sourceHandle: params.sourceHandle,
                targetHandle: params.targetHandle,
                label: params.sourceHandle,
                markerEnd: { type: MarkerType.ArrowClosed },
                data: { cond: "", assignments: [], assign: null },
            };

            const updatedEdges = [...edges, newEdge];
            setEdges(updatedEdges);

            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id !== params.source) return node;

                    const events = node.data.events || [];

                    const existingEvent = events.find(
                        (event) => event.id === params.sourceHandle
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
                                    id: params.sourceHandle,
                                    selectedPackage:
                                        getSkillPackageName(
                                            targetNode?.data.fullSkillName
                                        ),
                                    selectedSkill:
                                        targetNode?.data.fullSkillName?.split("#")[0] || "",
                                    target: params.target,
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

            const outgoingFromHandle = updatedEdges.filter(
                (e) => e.source === params.source && e.sourceHandle === params.sourceHandle
            );

            if (outgoingFromHandle.length >= 2) {
                openConditionDrawer(params.source, params.sourceHandle, params.target, updatedEdges);
            }
        },
        [edges, nodes]
    );

    const onEdgeDoubleClick = useCallback(
        (event, edge) => {
            openConditionDrawer(edge.source, edge.sourceHandle, edge.target);
        },
        [edges, nodes]
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

        // Rebuild this state's edges in exactly the order selected in step 1.
        setEdges((currentEdges) => {
            const untouchedEdges = currentEdges.filter(
                (edge) => edge.source !== sourceId
            );
            const existingById = new Map(
                currentEdges.map((edge) => [edge.id, edge])
            );

            const rebuiltEdges = updatedTransitions.map((transition) => {
                const existing = transition.edgeId
                    ? existingById.get(transition.edgeId)
                    : null;
                const eventId = transition.event || "success";
                const hasCondition = Boolean(
                    transition.cond && transition.cond.trim()
                );

                return {
                    ...(existing || {}),
                    id:
                        existing?.id ||
                        `edge-${sourceId}-${eventId}-${transition.target}-${crypto.randomUUID()}`,
                    source: sourceId,
                    target: transition.target,
                    sourceHandle: eventId,
                    targetHandle: existing?.targetHandle || null,
                    type:
                        sourceId === transition.target
                            ? "smoothstep"
                            : existing?.type || "default",
                    label: hasCondition
                        ? `${eventId} [${transition.cond}]`
                        : eventId,
                    markerEnd:
                        existing?.markerEnd || { type: MarkerType.ArrowClosed },
                    data: {
                        ...(existing?.data || {}),
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
                const orderedTransitionEvents = updatedTransitions.map(
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
        if (!targetNode) return;

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
                    label: event.id,
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

    const checkSlotConnection = (customNodes = null) => {
        const targetNodes = Array.isArray(customNodes) ? customNodes : nodes;
        if (!targetNodes || targetNodes.length === 0) {
            setSlotNodes([]);
            setSlotEdges([]);
            return;
        }

        const usedPaths = new Map();

        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((s) => {
                if (s.path && s.path.trim()) {
                    const cleanPath = s.path.trim().replace(/^\//, "");

                    usedPaths.set(cleanPath, s.type || "Unknown");
                }
            });

            (node.data.outSlots || []).forEach((s) => {
                if (s.path && s.path.trim()) {
                    const cleanPath = s.path.trim().replace(/^\//, "");

                    usedPaths.set(cleanPath, s.type || "Unknown");
                }
            });
        });

        const generatedSlotNodes = [];
        let index = 0;

        usedPaths.forEach((slotType, path) => {
            const slotNodeId = `slot-${path}`;

            generatedSlotNodes.push({
                id: slotNodeId,
                position: {
                    x: 380 + (index % 3) * 200,
                    y: 120 + Math.floor(index / 3) * 140
                },
                type: "slot",
                data: {
                    path: `/${path}`,
                    label: `/${path}`,
                    slotType: slotType,
                },
            });

            index++;
        });


        setSlotNodes(generatedSlotNodes);

        const newSlotEdges = [];
        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((inslot, inIndex) => {
                if (inslot.path && inslot.path.trim() !== "") {
                    const cleanPath = inslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    newSlotEdges.push({
                        id: `edge-read-${slotNodeId}-${node.id}-${inIndex}`,
                            source: slotNodeId,
                            target: node.id,
                            sourceHandle: "read-source",
                            targetHandle: `read-target-${inIndex}`,
                            style: { stroke: "#38bdf8", strokeWidth: 1.5, strokeDasharray: "5 5" },
                            markerEnd: { type: MarkerType.ArrowClosed },
                    });
                }
            });

            (node.data.outSlots || []).forEach((outslot, outIndex) => {
                if (outslot.path && outslot.path.trim() !== "") {
                    const cleanPath = outslot.path.trim().replace(/^\//, "");
                    const slotNodeId = `slot-${cleanPath}`;
                    newSlotEdges.push({
                        id: `edge-write-${node.id}-${slotNodeId}-${outIndex}`,
                        source: node.id,
                        target: slotNodeId,
                        sourceHandle: `write-source-${outIndex}`,
                        targetHandle: "write-target",
                        style: { stroke: "#22c55e", strokeWidth: 1.5, strokeDasharray: "5 5" },
                        markerEnd: { type: MarkerType.ArrowClosed },
                    });
                }
            });
        });

        setSlotEdges(newSlotEdges);
    };

// Dynamische Aktualisierung der Events basierend auf neuen Parameterwerten
    const updateEventsFromParameters = async (nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const fullSkillName = node.data.fullSkillName.split("#")[0];
        const params = {};

        node.data.params.forEach((param) => {
            params[param.key] = param.expr;
        });

        try {
            const response = await fetch(`/api/skill/${fullSkillName}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ params }),
            });

            const data = await response.json();

            const newEvents = data.events.map((event) => ({
                id: event.event,
                description: event.description || "",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
            }));

            newEvents.push({
                id: "fatal",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
            });

            newEvents.push({
                id: "*",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
                assignments: [],
                assignLocation: "",
                assignExpr: "",
            });

            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== nodeId) return n;
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            events: newEvents,
                            sensors:
                                data.sensors !== undefined
                                    ? data.sensors
                                    : n.data.sensors || [],
                            actuators:
                                data.actuator !== undefined
                                    ? data.actuator
                                    : data.actuators !== undefined
                                        ? data.actuators
                                        : n.data.actuators || [],
                        },
                    };
                })
            );
        } catch (error) {
            console.error("Error updating events from parameters:", error);
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

                setGlobalDataModel(parsed.globalDataModel);
                setNodes(parsed.nodes);
                setEdges(parsed.edges);
                setSelectedNodeId(null);

                const cleanTitle = filePath.split('/').pop().replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? { ...t, title: cleanTitle, fileName: filePath.split('/').pop(), fileHandle: null, filePath }
                            : t
                    )
                );

                checkSlotConnection(parsed.nodes);
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

                setGlobalDataModel(parsed.globalDataModel);
                setNodes(parsed.nodes);
                setEdges(parsed.edges);
                setSelectedNodeId(null);

                const cleanTitle = file.name.replace(/\.(xml|scxml)$/i, "");
                setTabs((prev) =>
                    prev.map((t) =>
                        t.id === activeTabId
                            ? { ...t, title: cleanTitle, fileName: file.name, fileHandle: handle }
                            : t
                    )
                );

                checkSlotConnection(parsed.nodes);
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
        const xml = generateXmlString(nodes, edges, globalDataModel);
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
                            ? { ...t, title: cleanTitle, fileName: result.fileName, filePath: result.filePath }
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
        const xml = generateXmlString(nodes, globalDataModel);
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
                            ? { ...t, title: cleanTitle, fileName: result.fileName, filePath: result.filePath }
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

    const handleNodeDragStop = useCallback((event, node) => {
        const elem = document.elementFromPoint(event.clientX, event.clientY);
        if (elem && elem.closest(".trash-bin-dropzone")) {
            setNodes((currentNodes) => {
                // 1. Alle Kind-IDs rekursiv ermitteln
                const idsToDelete = new Set([node.id]);
                let foundNew = true;

                while (foundNew) {
                    foundNew = false;
                    currentNodes.forEach((n) => {
                        if (n.parentId && idsToDelete.has(n.parentId) && !idsToDelete.has(n.id)) {
                            idsToDelete.add(n.id);
                            foundNew = true;
                        }
                    });
                }

                // 2. Kanten aufräumen, die an gelöschten Knoten hängen
                setEdges((eds) =>
                    eds.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target))
                );

                setSlotEdges((eds) => {
                    const updated = eds.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target));
                    setSlotNodes((sNodes) =>
                        sNodes.filter((sn) => updated.some((e) => e.source === sn.id || e.target === sn.id))
                    );
                    return updated;
                });

                setSelectedNodeId((id) => (idsToDelete.has(id) ? null : id));

                // 3. Alle identifizierten Knoten auf einmal entfernen
                return currentNodes.filter((n) => !idsToDelete.has(n.id));
            });
            setSelectedNodeId((id) => (id === node.id ? null : id));
        }
        setIsDraggingNode(false);
        setIsOverTrash(false);
    }, [setNodes, setEdges, setSlotEdges, setSlotNodes]);


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
                />

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
                                    onClick={() => switchTab(tab.id)}
                                    onMouseEnter={(event) =>
                                        handleTabMouseEnter(event, tab)
                                    }
                                    onMouseLeave={handleTabMouseLeave}
                                >
                                    <span>{tab.title}</span>
                                    {tabs.length > 1 && (
                                        <span
                                            className="intellij-tab-close"
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

                    <div
                        className="flow-container"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async (e) => {
                            e.preventDefault();
                            if (activeMode === "code") return;
                            const skill = e.dataTransfer.getData("skill");
                            if (!skill) return;
                            const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                            const newNode = await createNode(skill.split("skills.")[1], getNodeId(), position);
                            setNodes((nds) => nds.concat(newNode));
                        }}
                    >
                        {activeMode === "code" ? (
                            <CodeView
                                codeString={generateXmlString(nodes, edges, globalDataModel)}
                                activeMode={activeMode}
                                setActiveMode={setActiveMode}
                            />
                        ) : (
                            <>
                                <div className="mode-button-group-floating">
                                    {["event", "slots", "both", "code"].map((m) => (
                                        <button
                                            key={m}
                                            className={`mode-button ${activeMode === m ? "active" : ""}`}
                                            onClick={() => setActiveMode(m)}
                                        >
                                            {m === "event" ? "Event Mode" : m === "slots" ? "Slot Mode" : m === "both" ? "Both Mode" : "Code View"}
                                        </button>
                                    ))}
                                </div>

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
                                    </div>
                                )}

                                {/* ReactFlow mit Strg-Support */}
                                <ReactFlow
                                    nodes={visibleNodes}
                                    edges={visibleEdges}
                                    onNodesChange={handleNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    onEdgeDoubleClick={onEdgeDoubleClick}
                                    nodeTypes={nodeTypes}
                                    onNodeClick={(_, n) => {
                                        if (n.type === "parallelLane" && n.parentId) {
                                            setSelectedNodeId(n.parentId);
                                            setActiveTab("allgemein");
                                            return;
                                        }
                                        setSelectedNodeId(n.id);
                                        setRightPanelTab("details");
                                    }}
                                    onPaneClick={() => {
                                        setSelectedNodeId(null);
                                        setRightPanelTab("datamodel");
                                    }}
                                    onPaneContextMenu={(e) => handleContextMenuOpen(e)}
                                    onNodeContextMenu={(e, node) => handleContextMenuOpen(e, node)}
                                    multiSelectionKeyCode={["Control", "Meta"]}
                                    selectionKeyCode={["Control", "Meta"]}
                                    deleteKeyCode={["Delete"]}
                                    onNodeDoubleClick={(_, n) => {
                                        if (n.type === "submachine" && n.data?.src) {
                                            handleOpenSubMachine(n.data.src, n.data.label);
                                        }
                                    }}
                                    onNodeDragStart={() => setIsDraggingNode(true)}
                                    onNodeDrag={(e) => setIsOverTrash(Boolean(document.elementFromPoint(e.clientX, e.clientY)?.closest(".trash-bin-dropzone")))}
                                    onNodeDragStop={handleNodeDragStop}
                                >
                                    <Background />
                                    <Controls />
                                </ReactFlow>
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
                                Details
                            </button>
                        )}
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

                        {rightPanelTab === "details" && selectedNode && (
                            <DetailsPanel
                                selectedNode={selectedNode}
                                hasInitialNode={hasInitialNode}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                packages={packages}
                                getPackageSkillEvent={getPackageSkillEvent}
                                onSetInitial={() =>
                                    setNodes((nds) =>
                                        nds.map((n) => ({
                                            ...n,
                                            data: {
                                                ...n.data,
                                                isInitial: n.id === selectedNode.id,
                                            },
                                        }))
                                    )
                                }
                                onUpdateName={(name) =>
                                    setNodes((nds) =>
                                        nds.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const isContainerOrSub = n.type === "compound" || n.type === "parallel" || n.type === "submachine";
                                    return {
                                        ...n,
                                        data: {
                                            ...n.data,
                                            label: name,
                                            fullSkillName: isContainerOrSub
                                                ? name
                                                : `${n.data.fullSkillName?.split("#")[0]}#${name}`,
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
                                onUpdateParameter={(idx, val) =>
                                    setNodes((nds) =>
                                        nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, params: n.data.params.map((p, i) => (i === idx ? { ...p, expr: val } : p)) } } : n))
                                    )
                                }

                                onUpdateParameterBlur={updateEventsFromParameters}
                                globalDataModel={availableDataModelParameters}
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
                                onUpdateInSlotPath={(idx, val) =>
                                    setNodes((nds) =>
                                        nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, inSlots: n.data.inSlots.map((s, i) => (i === idx ? { ...s, path: val } : s)) } } : n))
                                    )
                                }
                                onUpdateOutSlotPath={(idx, val) =>
                                    setNodes((nds) =>
                                        nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, outSlots: n.data.outSlots.map((s, i) => (i === idx ? { ...s, path: val } : s)) } } : n))
                                    )
                                }
                                onCheckSlots={checkSlotConnection}
                            />
                        )}
                    </div>
                </div>
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
                onClose={() => setDrawerData((prev) => ({ ...prev, isOpen: false }))}
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
