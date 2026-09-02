import { useState, useEffect, useCallback, useMemo } from "react";
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

// Ausgelagerte Utils (saveScxmlFile statt exportScxmlFile)
import { generateXmlString, saveScxmlFile, saveScxmlFileTauri, openScxmlFileTauri, readScxmlFileContent } from "./utils/scxmlExport";
import { parseScxmlFile } from "./utils/scxmlImport";
import { DEFAULT_PREFIX_CONFIG, resolveSrcPath } from "./config/prefixMapping";
import { isTauri, initApiProxy } from "./tauri-client.js";
import "./App.css";

// Initialize API proxy for Tauri desktop mode (intercepts /api/* fetch calls)
initApiProxy();

const nodeTypes = { custom: CustomNode, slot: SlotNode, submachine: SubMachineNode, parallel: ParallelNode, compound: CompoundNode };
const getNodeId = () => `skill-node-${crypto.randomUUID()}`;

// Detect if running in Tauri desktop app
const IS_DESKTOP = isTauri();

function AppContent() {
    const [skills, setSkills] = useState({ skills: [] });
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Alle");
    const [searchText, setSearchText] = useState("");

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
            globalDataModel: [
                { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
            ],
        },
    ]);
    const [activeTabId, setActiveTabId] = useState("tab-1");

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [slotNodes, setSlotNodes, onSlotNodesChange] = useNodesState([]);
    const [slotEdges, setSlotEdges, onSlotEdgesChange] = useEdgesState([]);

    const [activeMode, setActiveMode] = useState("event");
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [activeTab, setActiveTab] = useState("allgemein");

    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isOverTrash, setIsOverTrash] = useState(false);

    const [globalDataModel, setGlobalDataModel] = useState([
        { id: "#_STATE_PREFIX", expr: "'de.unibi.citec.clf.bonsai.skills.'" },
        { id: "Test: globales Datamodel", expr: "testen" },
    ]);
    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");

    // Condition Drawer State
    const [drawerData, setDrawerData] = useState({
        isOpen: false,
        sourceNodeId: null,
        sourceNodeName: "",
        sourceEventName: "",
        initialTargetId: null,
        candidateTransitions: [],
    });

    const { screenToFlowPosition, fitView } = useReactFlow();

    // Aktuellen Tab synchronisieren beim Tabwechsel
    const switchTab = (targetTabId) => {
        if (targetTabId === activeTabId) return;

        setTabs((prevTabs) =>
            prevTabs.map((t) =>
                t.id === activeTabId
                    ? {
                          ...t,
                          nodes,
                          edges,
                          slotNodes,
                          slotEdges,
                          globalDataModel,
                      }
                    : t
            )
        );

        const targetTab = tabs.find((t) => t.id === targetTabId);
        if (targetTab) {
            setActiveTabId(targetTabId);
            setNodes(targetTab.nodes || []);
            setEdges(targetTab.edges || []);
            setSlotNodes(targetTab.slotNodes || []);
            setSlotEdges(targetTab.slotEdges || []);
            setGlobalDataModel(targetTab.globalDataModel || []);
            setSelectedNodeId(null);
            setTimeout(() => fitView({ padding: 0.2, duration: 250 }), 50);
        }
    };

    const handleAddNewTab = () => {
        const updatedCurrent = tabs.map((t) =>
            t.id === activeTabId
                ? { ...t, nodes, edges, slotNodes, slotEdges, globalDataModel }
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
            setSelectedNodeId(null);
        }
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

            const newTabObj = {
                id: tabId,
                title: label || baseName,
                fileName: fileName,
                fileHandle: null,
                nodes: parsed.nodes,
                edges: parsed.edges,
                slotNodes: [],
                slotEdges: [],
                globalDataModel: parsed.globalDataModel,
            };

            setTabs((prev) => [
                ...prev.map((t) =>
                    t.id === activeTabId
                        ? { ...t, nodes, edges, slotNodes, slotEdges, globalDataModel }
                        : t
                ),
                newTabObj,
            ]);

            setActiveTabId(tabId);
            setNodes(parsed.nodes);
            setEdges(parsed.edges);
            setGlobalDataModel(parsed.globalDataModel);
            setSelectedNodeId(null);
            checkSlotConnection(parsed.nodes);
            setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
        } catch (err) {
            console.error("Sub-Machine loading error:", err);
            alert(`Error automatically loading the sub-machine:\n${err.message}\n\nURL retrieved: ${resolvedUrl}`);
        }
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
            return n;
        });
    }, [nodes, tabs, activeTabId]);

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

    const packages = Array.from(new Set((skills.skills || []).map((s) => s.split(".")[6]).filter(Boolean)));
    const searchedSkills = (skills.skills || []).filter((s) => s.toLowerCase().includes(searchText.toLowerCase()));
    const packageSkills = selectedPackage
        ? (skills.skills || []).filter((s) => s.includes(`skills.${selectedPackage}.`) && s.toLowerCase().includes(searchText.toLowerCase()))
        : [];
    const filteredSkills = (skills.skills || [])
        .filter((s) => (activeFilter === "Alle" ? true : s.includes(activeFilter)))
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
                events: [
                    ...(data.events || []).map((e) => ({
                        id: e.event,
                        selectedPackage: "",
                        selectedSkill: "",
                        target: null,
                        cond: "",
                        assignLocation: "",
                        assignExpr: "",
                    })),
                    {
                        id: "*",
                        selectedPackage: "",
                        selectedSkill: "",
                        target: null,
                        cond: "",
                        assignLocation: "",
                        assignExpr: "",
                    },
                ],

                inSlots: (data.inSlots || []).map((s) => ({ key: s.key, type: s.type, path: "" })),
                outSlots: (data.outSlots || []).map((s) => ({ key: s.key, type: s.type, path: "" })),
                params: (data.params || []).map((p) => ({ key: p.key, type: p.type, required: p.required, default: p.default })),
            },
        };
    };

    const handleNodesChange = (changes) => {
        onNodesChange(changes);
        onSlotNodesChange(changes);
    };

    const openConditionDrawer = (sourceId, sourceHandle, initialTargetId = null, customEdges = null) => {
        const sourceNode = nodes.find((n) => n.id === sourceId);
        if (!sourceNode) return;

        const currentEdges = customEdges || edges;
        const matchingEdges = currentEdges.filter(
            (e) => e.source === sourceId && e.sourceHandle === sourceHandle
        );

        const nodeEventsForHandle = (sourceNode.data.events || []).filter(
            (ev) => ev.id === sourceHandle && ev.target
        );

        const transitions = [];

        nodeEventsForHandle.forEach((ev) => {
            const edge = matchingEdges.find((e) => e.target === ev.target);
            if (edge || ev.target === initialTargetId) {
                const targetNode = nodes.find((n) => n.id === ev.target);
                transitions.push({
                    target: ev.target,
                    targetLabel: targetNode ? targetNode.data.label : (edge?.label || ev.target),
                    cond: ev.cond || edge?.data?.cond || "",
                    assignLocation: ev.assignLocation || edge?.data?.assign?.location || "",
                    assignExpr: ev.assignExpr || edge?.data?.assign?.expr || "",
                });
            }
        });

        matchingEdges.forEach((edge) => {
            if (!transitions.some((t) => t.target === edge.target)) {
                const targetNode = nodes.find((n) => n.id === edge.target);
                transitions.push({
                    target: edge.target,
                    targetLabel: targetNode ? targetNode.data.label : (edge.label || edge.target),
                    cond: edge.data?.cond || "",
                    assignLocation: edge.data?.assign?.location || "",
                    assignExpr: edge.data?.assign?.expr || "",
                });
            }
        });

        setDrawerData({
            isOpen: true,
            sourceNodeId: sourceId,
            sourceNodeName: sourceNode.data.label,
            sourceEventName: sourceHandle,
            initialTargetId: initialTargetId || transitions[0]?.target || "",
            candidateTransitions: transitions,
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
                data: { cond: "", assign: null },
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
                                        targetNode?.data.fullSkillName?.split(".")[0] || "",
                                    selectedSkill:
                                        targetNode?.data.fullSkillName?.split("#")[0] || "",
                                    target: params.target,
                                    cond: "",
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

    const handleConfirmDrawer = ({ updatedTransitions, newGlobalVar }) => {
        if (newGlobalVar) {
            setGlobalDataModel((prev) => [...prev, newGlobalVar]);
        }

        const sourceId = drawerData.sourceNodeId;
        const sourceHandle = drawerData.sourceEventName;

        if (!sourceId || !sourceHandle || !updatedTransitions) return;

        setEdges((eds) =>
            eds.map((edge) => {
                if (edge.source === sourceId && edge.sourceHandle === sourceHandle) {
                    const matched = updatedTransitions.find((t) => t.target === edge.target);
                    if (matched) {
                        const hasCond = matched.cond && matched.cond.trim() !== "";
                        return {
                            ...edge,
                            label: hasCond ? `${sourceHandle} [${matched.cond}]` : sourceHandle,
                            data: {
                                cond: matched.cond || "",
                                assign: matched.assignLocation
                                    ? { location: matched.assignLocation, expr: matched.assignExpr }
                                    : null,
                            },
                        };
                    }
                }
                return edge;
            })
        );

        setNodes((nds) =>
            nds.map((node) => {
                if (node.id !== sourceId) return node;

                const otherHandleEvents = (node.data.events || []).filter((ev) => ev.id !== sourceHandle);

                const reorderedHandleEvents = updatedTransitions.map((t) => {
                    const existingEv = (node.data.events || []).find(
                        (ev) => ev.id === sourceHandle && ev.target === t.target
                    );
                    return {
                        id: sourceHandle,
                        selectedPackage: existingEv?.selectedPackage || "",
                        selectedSkill: existingEv?.selectedSkill || "",
                        target: t.target,
                        cond: t.cond || "",
                        assignLocation: t.assignLocation || "",
                        assignExpr: t.assignExpr || "",
                    };
                });

                return {
                    ...node,
                    data: {
                        ...node.data,
                        events: [...otherHandleEvents, ...reorderedHandleEvents],
                    },
                };
            })
        );

        setDrawerData((prev) => ({ ...prev, isOpen: false }));
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

    const createNodeforEvent = async (event, selectedSkill) => {
        if (!selectedSkill || !selectedNode) return;
        if (event.target) {
            setNodes((nds) => nds.filter((n) => n.id !== event.target));
            setEdges((eds) => eds.filter((e) => e.target !== event.target));
        }

        const newNodeId = getNodeId();
        const newNode = await createNode(selectedSkill, newNodeId, {
            x: selectedNode.position.x + 240,
            y: selectedNode.position.y + 60,
        });

        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) =>
            addEdge({ source: selectedNode.id, target: newNodeId, sourceHandle: event.id, label: event.id, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
        );
        updateNodeEvent(selectedNode.id, event.id, { selectedSkill, target: newNodeId });
    };

    const checkSlotConnection = (customNodes = null) => {
        const targetNodes = Array.isArray(customNodes) ? customNodes : nodes;
        if (!targetNodes || targetNodes.length === 0) {
            setSlotNodes([]);
            setSlotEdges([]);
            return;
        }

        const usedPaths = new Set();
        targetNodes.forEach((node) => {
            (node.data.inSlots || []).forEach((s) => s.path && s.path.trim() && usedPaths.add(s.path.trim().replace(/^\//, "")));
            (node.data.outSlots || []).forEach((s) => s.path && s.path.trim() && usedPaths.add(s.path.trim().replace(/^\//, "")));
        });

        const generatedSlotNodes = [];
        let index = 0;

        usedPaths.forEach((path) => {
            const slotNodeId = `slot-${path}`;
            generatedSlotNodes.push({
                id: slotNodeId,
                position: { x: 380 + (index % 3) * 200, y: 120 + Math.floor(index / 3) * 140 },
                type: "slot",
                data: { path: `/${path}`, label: `/${path}` },
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
                        label: inslot.key,
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
                        label: outslot.key,
                        style: { stroke: "#22c55e", strokeWidth: 1.5, strokeDasharray: "5 5" },
                        markerEnd: { type: MarkerType.ArrowClosed },
                    });
                }
            });
        });

        setSlotEdges(newSlotEdges);
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
        const xml = generateXmlString(nodes, globalDataModel);
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
            setNodes((nds) => nds.filter((n) => n.id !== node.id));
            setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
            setSlotEdges((eds) => {
                const updated = eds.filter((e) => e.source !== node.id && e.target !== node.id);
                setSlotNodes((sNodes) => sNodes.filter((sn) => updated.some((e) => e.source === sn.id || e.target === sn.id)));
                return updated;
            });
            setSelectedNodeId((id) => (id === node.id ? null : id));
        }
        setIsDraggingNode(false);
        setIsOverTrash(false);
    }, [setNodes, setEdges, setSlotEdges, setSlotNodes]);

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
                    setSelectedPackage={setSelectedPackage}
                    searchedSkills={searchedSkills}
                    packageSkills={packageSkills}
                    filteredSkills={filteredSkills}
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
                                codeString={generateXmlString(nodes, globalDataModel)}
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

                                <ReactFlow
                                    nodes={visibleNodes}
                                    edges={visibleEdges}
                                    onNodesChange={handleNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onConnect={onConnect}
                                    onEdgeDoubleClick={onEdgeDoubleClick}
                                    nodeTypes={nodeTypes}
                                    onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                                    onNodeDoubleClick={(_, n) => {
                                        if (n.type === "submachine" && n.data?.src) {
                                            handleOpenSubMachine(n.data.src, n.data.label);
                                        }
                                    }}
                                    onPaneClick={() => setSelectedNodeId(null)}
                                    onNodeDragStart={() => setIsDraggingNode(true)}
                                    onNodeDrag={(e) => setIsOverTrash(Boolean(document.elementFromPoint(e.clientX, e.clientY)?.closest(".trash-bin-dropzone")))}
                                    onNodeDragStop={handleNodeDragStop}
                                    deleteKeyCode={["Delete"]}
                                >
                                    <Background />
                                    <Controls />
                                </ReactFlow>
                            </>
                        )}
                    </div>
                </main>

                {selectedNode === null ? (
                    <WorkflowPanel
                        globalDataModel={globalDataModel}
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
                        onAddGlobalParam={() => {
                            if (!newParamId.trim()) return;
                            setGlobalDataModel((prev) => [...prev, { id: newParamId, expr: newParamExpr }]);
                            setNewParamId("");
                            setNewParamExpr("");
                        }}
                    />
                ) : (
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
                                nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, fullSkillName: `${n.data.fullSkillName.split("#")[0]}#${name}` } } : n))
                            )
                        }
                        onUpdateSrc={(nodeId, newSrc) =>
                            setNodes((nds) =>
                                nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, src: newSrc } } : n))
                            )
                        }
                        onUpdateEvent={updateNodeEvent}
                        onCreateNodeForEvent={createNodeforEvent}
                        onUpdateParameter={(idx, val) =>
                            setNodes((nds) =>
                                nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, params: n.data.params.map((p, i) => (i === idx ? { ...p, expr: val } : p)) } } : n))
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

            <ConditionModal
                isOpen={drawerData.isOpen}
                onClose={() => setDrawerData((prev) => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmDrawer}
                globalVariables={globalDataModel}
                sourceNodeName={drawerData.sourceNodeName}
                sourceEventName={drawerData.sourceEventName}
                candidateTransitions={drawerData.candidateTransitions}
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