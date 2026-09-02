import dagre from "@dagrejs/dagre";

export const getLayoutedElements = (nodesToLayout, edgesToLayout) => {
    try {
        const GraphClass = dagre.graphlib ? dagre.graphlib.Graph : dagre.Graph;
        const dagreGraph = new GraphClass();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Layout von links nach rechts mit ausreichendem Knotenabstand
        dagreGraph.setGraph({
            rankdir: "LR",
            nodesep: 60,
            ranksep: 120,
        });

        nodesToLayout.forEach((node) => {
            const width = node.style?.width || (node.type === "parallel" ? 640 : 180);
            const height = node.style?.height || (node.type === "parallel" ? 320 : 80);
            dagreGraph.setNode(node.id, { width, height });
        });

        edgesToLayout.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const layoutedNodes = nodesToLayout.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const width = node.style?.width || (node.type === "parallel" ? 640 : 180);
            const height = node.style?.height || (node.type === "parallel" ? 320 : 80);

            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - width / 2,
                    y: nodeWithPosition.y - height / 2,
                },
            };
        });

        return { nodes: layoutedNodes, edges: edgesToLayout };
    } catch (err) {
        console.warn("Layouting fehlgeschlagen, nutze Fallback-Positionen:", err);
        return { nodes: nodesToLayout, edges: edgesToLayout };
    }
};