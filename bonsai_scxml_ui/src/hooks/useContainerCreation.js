import { useCallback, useMemo, useRef } from "react";
import {
    COMPOUND_PADDING_X,
    COMPOUND_HEADER_HEIGHT,
    PARALLEL_HEADER_HEIGHT,
    PARALLEL_LANE_CHILD_TOP_INSET,
    PARALLEL_NODE_GAP,
    getCompoundExitGutterWidth,
    getNodeId,
    orderNodesParentsFirst,
    resolveNodeCollisionsAndRefit,
} from "../utils/editorGeometry";
import { rebuildBoundaryTransitions } from "../utils/boundaryTransitions";
import { getOverviewLayoutNodeSize } from "../utils/layoutUtils";


export function useContainerCreation({
    nodes,
    edges,
    isDraggingNode,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setActiveTab,
    setContextMenu,
    updateNodeInternals,
}) {
    const selectedNodesCacheRef = useRef([]);
    const selectionNodesDependency = isDraggingNode ? null : nodes;
    const selectedNodes = useMemo(() => {
        if (!selectionNodesDependency) {
            return selectedNodesCacheRef.current;
        }

        const candidates = selectionNodesDependency.filter(
            (node) =>
                node.selected &&
                node.type !== "parallelLane" &&
                !node.data?.autoParallelLaneCompound
        );

        // Container creation is scoped to siblings. This allows recursive
        // compounds/parallels while preventing one new container from trying
        // to adopt nodes that currently belong to unrelated parents.
        const groups = new Map();
        candidates.forEach((node) => {
            const key = node.parentId || "__root__";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(node);
        });
        const next = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
        selectedNodesCacheRef.current = next;
        return next;
    }, [selectionNodesDependency]);

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
            const laneHeight = 150;
            const headerHeight = PARALLEL_HEADER_HEIGHT;
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

    const handleCreateEmptyParallel = (pos) => {
        const parallelId = getNodeId();
        const parallelName = `parallel_${nodes.filter((n) => n.type === "parallel").length + 1}`;
        const laneHeight = 130;
        const headerHeight = PARALLEL_HEADER_HEIGHT;
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

    const getSelectionBoundingBox = (selectedList) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        selectedList.forEach((n) => {
            const x = n.position.x;
            const y = n.position.y;
            const { width: w, height: h } = getOverviewLayoutNodeSize(n);

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        return { minX, minY, maxX, maxY };
    };

    const handleCreateCompoundFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const selectionParentId = selectedNodes[0]?.parentId || null;

        const {
            minX,
            minY,
            maxX,
            maxY,
        } = getSelectionBoundingBox(selectedNodes);

        const padding = 40;
        const headerOffset = COMPOUND_HEADER_HEIGHT;

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

            ...(selectionParentId
                ? { parentId: selectionParentId, extent: "parent", expandParent: true }
                : {}),

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

        const parentAwareNodes = updatedNodes.map((candidate) => {
            if (candidate.id !== selectionParentId || !compoundNode.data.isInitial) {
                return candidate;
            }
            return {
                ...candidate,
                data: {
                    ...(candidate.data || {}),
                    initialChildId: compoundId,
                },
            };
        });

        const nextNodes =
            orderNodesParentsFirst([
                compoundNode,
                ...parentAwareNodes,
            ]);

        const normalizedGraph = rebuildBoundaryTransitions(
            nextNodes,
            [
                ...updatedEdges,
                ...internalExitEdges,
            ]
        );

        setNodes(normalizedGraph.nodes);
        setEdges(normalizedGraph.edges);

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

    const handleCreateParallelFromSelected = () => {
        if (selectedNodes.length < 1) return;

        const selectionParentId = selectedNodes[0]?.parentId || null;

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

        // 2. Use the same dimensions automatic Overview placement reserves.
        // This includes parameters and slot docks, not only transition rows.
        const getNodeWidth = (node) => getOverviewLayoutNodeSize(node).width;
        const getNodeHeight = (node) => getOverviewLayoutNodeSize(node).height;

        const headerHeight = PARALLEL_HEADER_HEIGHT;
        const buttonReserve = 40;
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

            ...(selectionParentId
                ? { parentId: selectionParentId, extent: "parent", expandParent: true }
                : {}),

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
                    initialChildId: group[0]?.id || null,
                },
            });

            // States DIREKT in die Lane. The lane itself is the single SCXML
            // compound branch; do not create another wrapper compound.
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
                        y: PARALLEL_LANE_CHILD_TOP_INSET,
                    },

                    selected: false,
                    data: {
                        ...(node.data || {}),
                        isInitial: node.id === group[0]?.id,
                    },
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

                return true;
            })
            .map((node) => {
                /*
                 * Nur Root-Nodes verschieben.
                 *
                 * Kinder eines Compound-/Parallel-/Submachine-Nodes
                 * werden automatisch mit ihrem Parent verschoben.
                 */
                if ((node.parentId || null) !== selectionParentId) {
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
        const parentAwareRootNodes = newRootNodes.map((candidate) => {
            if (
                candidate.id !== selectionParentId ||
                !parallelNode.data.isInitial
            ) {
                return candidate;
            }
            return {
                ...candidate,
                data: {
                    ...(candidate.data || {}),
                    initialChildId: parallelId,
                },
            };
        });

        const normalizedGraph = rebuildBoundaryTransitions(
            [...parentAwareRootNodes, ...newLanes, ...movedNodes],
            [...updatedEdges, ...newEdgesToAdd]
        );
        setNodes(normalizedGraph.nodes);
        setEdges(normalizedGraph.edges);
        setSelectedNodeId(parallelId);
        setActiveTab("allgemein");
    };

    return {
        selectedNodes,
        handleCreateEmptyCompound,
        handleAddLaneToParallel,
        handleCreateEmptyParallel,
        handleCreateCompoundFromSelected,
        handleCreateParallelFromSelected,
    };
}
