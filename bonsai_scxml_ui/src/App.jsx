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
    const [selectedSubPackage, setSelectedSubPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Everything");
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
        if (selectedNodes.length < 2) return;

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

        // Kind-Knoten relativ im Compound ausrichten
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
    };

    // 2. Parallel State erstellen
    const handleCreateParallelFromSelected = () => {
        if (selectedNodes.length < 2) return;

        const { minX, minY, maxX, maxY } = getSelectionBoundingBox(selectedNodes);
        const padding = 40;
        const headerHeight = 45;

        const containerWidth = Math.max(320, maxX - minX + padding * 2);
        const containerHeight = Math.max(180, maxY - minY + padding * 2 + headerHeight);

        const parallelId = getNodeId();
        const parallelName = `Parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;
        const branchNames = selectedNodes.map((n) => n.data.label || n.id);

        const parallelNode = {
            id: parallelId,
            type: "parallel",
            position: { x: minX - padding, y: minY - padding - headerHeight },
            style: { width: containerWidth, height: containerHeight },
            data: {
                label: parallelName,
                fullSkillName: parallelName,
                isInitial: selectedNodes.some((n) => n.data?.isInitial),
                lanes: branchNames,
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
                    parentId: parallelId,
                    extent: "parent",
                    position: {
                        x: node.position.x - (minX - padding),
                        y: node.position.y - (minY - padding - headerHeight),
                    },
                    selected: false,
                };
            }
            return node;
        });

        setNodes([parallelNode, ...updatedNodes]);
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
                        (ev) =>
                            ev.id === sourceHandle &&
                            ev.target === t.target
                    );

                    const baseEvent = existingEv ||
                        (node.data.events || []).find(
                            (ev) => ev.id === sourceHandle
                        );

                    return {
                        ...baseEvent,

                        id: sourceHandle,
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
                assignLocation: "",
                assignExpr: "",
            }));

            newEvents.push({
                id: "fatal",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
                assignLocation: "",
                assignExpr: "",
            });

            newEvents.push({
                id: "*",
                selectedPackage: "",
                selectedSkill: "",
                target: null,
                cond: "",
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

                                {/* Floating Grouping Toolbar bei Mehrfachauswahl */}
                                {selectedNodes.length >= 2 && activeMode !== "code" && (
                                    <div className="multi-selection-toolbar">
                                        <span className="selection-count">{selectedNodes.length} Nodes ausgewählt</span>
                                        <div className="selection-actions">
                                            <button className="group-btn compound-btn" onClick={handleCreateCompoundFromSelected}>
                                                Compound State
                                            </button>
                                            <button className="group-btn parallel-btn" onClick={handleCreateParallelFromSelected}>
                                                Parallel State
                                            </button>
                                            <button className="group-btn submachine-btn" onClick={handleCreateSubMachineFromSelected}>
                                                Sub-Machine
                                            </button>
                                        </div>
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
                                    onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                                    onPaneClick={() => setSelectedNodeId(null)}
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

                        onUpdateParameterBlur={updateEventsFromParameters}
                        globalDataModel={globalDataModel}
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
