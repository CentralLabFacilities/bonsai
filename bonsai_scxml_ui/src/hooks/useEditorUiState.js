import { useCallback, useEffect, useRef, useState } from "react";

export function useEditorUiState({ showPanel }) {
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [selectedSubPackage, setSelectedSubPackage] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Everything");
    const [searchText, setSearchText] = useState("");
    const [contextMenu, setContextMenu] = useState(null);
    const [controlPointInsertRequest, setControlPointInsertRequest] = useState(null);
    const [leftLibraryTab, setLeftLibraryTab] = useState("skills");
    const [isHintPageOpen, setIsHintPageOpen] = useState(false);
    const [activeMode, setActiveMode] = useState("overview");
    const [isCreateSlotModalOpen, setIsCreateSlotModalOpen] = useState(false);
    const [pendingSubMachineCreation, setPendingSubMachineCreation] = useState(null);
    const [stateMachineLoading, setStateMachineLoading] = useState(null);
    const [activeTab, setActiveTab] = useState("allgemein");
    const [rightPanelTab, setRightPanelTabState] = useState("datamodel");

    const beginStateMachineLoad = useCallback((label = "State machine") => {
        setStateMachineLoading({ label });
    }, []);

    const endStateMachineLoad = useCallback(() => {
        setStateMachineLoading(null);
    }, []);

    const setRightPanelTab = useCallback(
        (tab) => {
            setRightPanelTabState(tab);
            if (tab === "details") showPanel("inspector");
        },
        [showPanel],
    );

    useEffect(() => {
        if (
            isCreateSlotModalOpen &&
            activeMode !== "slots" &&
            activeMode !== "overview"
        ) {
            setIsCreateSlotModalOpen(false);
        }
    }, [activeMode, isCreateSlotModalOpen]);

    return {
        selectedPackage,
        setSelectedPackage,
        selectedSubPackage,
        setSelectedSubPackage,
        activeFilter,
        setActiveFilter,
        searchText,
        setSearchText,
        contextMenu,
        setContextMenu,
        controlPointInsertRequest,
        setControlPointInsertRequest,
        leftLibraryTab,
        setLeftLibraryTab,
        isHintPageOpen,
        setIsHintPageOpen,
        activeMode,
        setActiveMode,
        isCreateSlotModalOpen,
        setIsCreateSlotModalOpen,
        pendingSubMachineCreation,
        setPendingSubMachineCreation,
        stateMachineLoading,
        beginStateMachineLoad,
        endStateMachineLoad,
        activeTab,
        setActiveTab,
        rightPanelTab,
        setRightPanelTab,
    };
}

export function useRestoreCanvasViewportOnModeChange({ activeMode, fitView, getNodes }) {
    const previousActiveModeRef = useRef(activeMode);

    useEffect(() => {
        const previousMode = previousActiveModeRef.current;
        previousActiveModeRef.current = activeMode;

        if (previousMode !== "code" || activeMode === "code") return undefined;

        // Code View unmounts React Flow. Wait until the canvas has mounted and
        // measured its nodes again, then restore a useful workflow viewport.
        let frameA = null;
        let frameB = null;
        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const currentNodes = getNodes();
                const skillNodes = currentNodes.filter(
                    (node) =>
                        !node.hidden &&
                        (node.type === "custom" || node.type === "submachine"),
                );
                const focusNodes =
                    skillNodes.length > 0
                        ? skillNodes
                        : currentNodes.filter(
                              (node) =>
                                  !node.hidden &&
                                  node.type !== "slot" &&
                                  node.type !== "parallelLane",
                          );

                if (focusNodes.length === 0) return;
                fitView({
                    nodes: focusNodes.map((node) => ({ id: node.id })),
                    padding: 0.22,
                    maxZoom: 1.15,
                    duration: 260,
                });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [activeMode, fitView, getNodes]);
}
