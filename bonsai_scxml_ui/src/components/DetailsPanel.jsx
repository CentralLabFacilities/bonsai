import { memo, useEffect, useMemo, useRef } from "react";
import SlotDetailsPanel from "./detailsPanel/SlotDetailsPanel.jsx";
import GeneralDetailsSection from "./detailsPanel/GeneralDetailsSection.jsx";
import NopSendEditor from "./detailsPanel/NopSendEditor.jsx";
import {
    CloneReferencesSection,
    ParametersSection,
    SlotsSection,
    StateActionsSection,
} from "./detailsPanel/DetailsTabSections.jsx";
import { MetadataRow } from "./detailsPanel/DetailsPanelPrimitives.jsx";
import { getEditableExitTokens } from "./detailsPanel/exitTokens.js";
import {
    areDetailsPanelPropsEqual,
    getAvailableActionLocations,
} from "./detailsPanelSelectors.js";

function DetailsPanel({
                          selectedNode,
                          hasInitialNode,
                          activeTab,
                          setActiveTab,
                          onSetInitial,
                          onUpdateName,
                          onUpdateNameCommit,
                          availableTargetNodes = [],
                          onSetEventTarget,
                          onUpdateParameter,
                          onUpdateInSlotPath,
                          onUpdateOutSlotPath,
                          onCheckSlots,
                          availableSlotPaths = [],
                          onUpdateSrc,
                          globalDataModel,
                          actionValueVariables,
                          onUpdateStateActions,
                          onUpdateSendEvents,
                          slotDetails,
                          onUpdateSlotPath,
                          onUpdateSlotInherited,
                          onSelectSlotAccessSkill,
                          onHoverSlotAccessSkill,
                          onNavigateAncestorSlot,
                          onNavigateDescendantSlotSkill,
                          parameterFocusRequest,
                          slotFocusRequest,
                          transitionFocusRequest,
                          cloneSourceNode,
                          onNavigateCloneSource,
                          cloneNodes = [],
                          onNavigateClone,
                          containerOutgoingTransitions = [],
                          skillOutgoingTransitions = [],
                          onNavigateTransitionNode,
                          onHoverTransitionNode,
                          onOpenTransitionPanel,
                          parallelLanes = [],
                          onAddParallelLane,
                          onRenameParallelLane,
                          onMoveParallelLane,
                          onDeleteParallelLane,
                      }) {
    const isSubMachine =
        selectedNode.type === "submachine" ||
        Boolean(selectedNode.data.src);
    const isSkillClone = Boolean(selectedNode.data?.isSkillClone);
    const isStateClone = Boolean(selectedNode.data?.isStateClone);
    const isEditorClone = isSkillClone || isStateClone;
    const selectedReferenceId = isEditorClone
        ? String(selectedNode.data?.editorInstanceId || selectedNode.id || "").trim()
        : "";
    const hasClones = Array.isArray(cloneNodes) && cloneNodes.length > 0;
    const isContainerState =
        selectedNode.type === "compound" ||
        selectedNode.type === "parallel";
    const selectedSkillType = String(selectedNode.data?.fullSkillName || "")
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();
    const exposesImplicitFatal =
        selectedNode.type === "custom" &&
        !["fatal", "end"].includes(selectedSkillType) &&
        !selectedNode.data?.isFinal &&
        !selectedNode.data?.isBehaviorExit;
    const isNopSkill = !isSubMachine && selectedSkillType === "nop";
    const hasNopSend =
        isNopSkill &&
        Array.isArray(selectedNode.data?.behaviorExitEvents) &&
        String(selectedNode.data.behaviorExitEvents[0] || "").trim().length > 0;
    const editableExitTokens = useMemo(
        () => getEditableExitTokens(selectedNode.data.events || [], exposesImplicitFatal),
        [selectedNode.data.events, exposesImplicitFatal]
    );
    const usesEditorInstanceId =
        !isSubMachine &&
        ["nop", "fatal", "end"].includes(selectedSkillType);
    const skillDisplayName = String(selectedNode.data?.fullSkillName || "")
        .split("#")[0]
        .split(".")
        .pop() || selectedNode.data?.label || "—";
    const hidesParameterAndSlots =
        !isSubMachine &&
        ["nop", "fatal", "end"].includes(selectedSkillType);
    const hidesEntryExit =
        !isSubMachine &&
        (selectedSkillType === "fatal" ||
            selectedSkillType === "end" ||
            (isNopSkill && hasNopSend));

    const inspectorTabs = [{ id: "allgemein", label: "Overall" }];
    if (!isEditorClone) {
        if (hasClones) inspectorTabs.push({ id: "clones", label: "References" });
        if (!isSubMachine && !hidesParameterAndSlots) {
            inspectorTabs.push(
                { id: "parameter", label: "Parameter" },
                { id: "slots", label: "Slots" },
            );
        }
        if (isNopSkill) inspectorTabs.push({ id: "send", label: "Send" });
        if (!hidesEntryExit) inspectorTabs.push({ id: "actions", label: "Entry / Exit" });
    }
    const visibleActiveTab = inspectorTabs.some((tab) => tab.id === activeTab)
        ? activeTab
        : "allgemein";

    const tabListRef = useRef(null);
    const focusedTabRef = useRef(null);

    useEffect(() => {
        const focusedTab = focusedTabRef.current;
        if (!focusedTab || focusedTab.isConnected) return;

        focusedTabRef.current = null;
        if (document.activeElement === document.body) {
            tabListRef.current
                ?.querySelector('[role="tab"][aria-selected="true"]')
                ?.focus();
        }
    }, [selectedNode, cloneNodes, visibleActiveTab]);

    const handleTabKeyDown = (event, index) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        let nextIndex;
        switch (event.key) {
            case "ArrowLeft":
                nextIndex = (index - 1 + inspectorTabs.length) % inspectorTabs.length;
                break;
            case "ArrowRight":
                nextIndex = (index + 1) % inspectorTabs.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = inspectorTabs.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        event.stopPropagation();
        tabListRef.current.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
        setActiveTab(inspectorTabs[nextIndex].id);
    };

    const handledParameterFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!parameterFocusRequest) return;
        if (activeTab !== "parameter") return;
        if (selectedNode.id !== parameterFocusRequest.nodeId) return;
        if (
            handledParameterFocusRequestRef.current ===
            parameterFocusRequest.requestId
        ) {
            return;
        }

        const parameterIndex = (selectedNode.data?.params || []).findIndex(
            (parameter) =>
                String(parameter?.key || "") ===
                String(parameterFocusRequest.parameterKey || "")
        );

        if (parameterIndex < 0) return;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(
                    `param-${selectedNode.id}-${parameterIndex}`
                );

                if (!input) return;

                handledParameterFocusRequestRef.current =
                    parameterFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        parameterFocusRequest,
        selectedNode.id,
        selectedNode.data?.params,
    ]);

    const handledSlotFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!slotFocusRequest) return;
        if (activeTab !== "slots") return;
        if (selectedNode.id !== slotFocusRequest.nodeId) return;
        if (
            handledSlotFocusRequestRef.current ===
            slotFocusRequest.requestId
        ) {
            return;
        }

        const slots =
            slotFocusRequest.access === "write"
                ? selectedNode.data?.outSlots || []
                : selectedNode.data?.inSlots || [];
        const slotIndex = slots.findIndex(
            (slot) =>
                String(slot?.key || "") ===
                String(slotFocusRequest.slotKey || "")
        );

        if (slotIndex < 0) return;

        const inputId = `${
            slotFocusRequest.access === "write" ? "out" : "in"
        }-slot-${selectedNode.id}-${slotIndex}`;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(inputId);
                if (!input) return;

                handledSlotFocusRequestRef.current =
                    slotFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        slotFocusRequest,
        selectedNode.id,
        selectedNode.data?.inSlots,
        selectedNode.data?.outSlots,
    ]);

    const handledTransitionFocusRequestRef = useRef(null);

    useEffect(() => {
        if (!transitionFocusRequest) return;
        if (activeTab !== "allgemein") return;
        if (selectedNode.id !== transitionFocusRequest.nodeId) return;
        if (
            handledTransitionFocusRequestRef.current ===
            transitionFocusRequest.requestId
        ) {
            return;
        }

        const eventIndex = editableExitTokens.findIndex(
            (event) =>
                String(event?.id || "") ===
                String(transitionFocusRequest.eventId || "")
        );

        if (eventIndex < 0) return;

        let frameA = null;
        let frameB = null;

        frameA = requestAnimationFrame(() => {
            frameB = requestAnimationFrame(() => {
                const input = document.getElementById(
                    `transition-target-${selectedNode.id}-${eventIndex}`
                );
                if (!input) return;

                handledTransitionFocusRequestRef.current =
                    transitionFocusRequest.requestId;
                input.focus();

                const cursorPosition = String(input.value || "").length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }

                input.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
        });

        return () => {
            if (frameA !== null) cancelAnimationFrame(frameA);
            if (frameB !== null) cancelAnimationFrame(frameB);
        };
    }, [
        activeTab,
        transitionFocusRequest,
        selectedNode.id,
        editableExitTokens,
    ]);

    useEffect(() => {
        if (selectedNode.type !== "slot" && activeTab !== visibleActiveTab) {
            setActiveTab(visibleActiveTab);
        }
    }, [
        activeTab,
        visibleActiveTab,
        selectedNode.type,
        setActiveTab,
    ]);

    const hasStateDetails = selectedNode.type !== "slot" && !isEditorClone;
    // Child datamodel entries are writable in a sub-machine; parent values remain read-only.
    const availableActionLocations = useMemo(
        () => hasStateDetails
            ? getAvailableActionLocations(globalDataModel, selectedNode.data.params, isSubMachine)
            : [],
        [hasStateDetails, globalDataModel, selectedNode.data.params, isSubMachine]
    );

    const tabBar = (
        <div
            ref={tabListRef}
            className="tabs"
            role="tablist"
            aria-label="Node details"
            onFocus={(event) => {
                focusedTabRef.current = event.target;
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    focusedTabRef.current = null;
                }
            }}
        >
            {inspectorTabs.map((tab, index) => (
                <button
                    key={tab.id}
                    type="button"
                    className={`tab ${visibleActiveTab === tab.id ? "active-tab" : ""}`}
                    id={`details-tab-${tab.id}`}
                    role="tab"
                    aria-selected={visibleActiveTab === tab.id}
                    aria-controls="details-tab-panel"
                    tabIndex={visibleActiveTab === tab.id ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );

    if (selectedNode.type === "slot") {
        return (
            <SlotDetailsPanel
                key={selectedNode.id}
                selectedNode={selectedNode}
                slotDetails={slotDetails}
                availableSlotPaths={availableSlotPaths}
                onUpdateSlotPath={onUpdateSlotPath}
                onUpdateSlotInherited={onUpdateSlotInherited}
                onSelectSkill={onSelectSlotAccessSkill}
                onHoverSkill={onHoverSlotAccessSkill}
                onNavigateAncestorSlot={onNavigateAncestorSlot}
                onNavigateDescendantSkill={onNavigateDescendantSlotSkill}
            />
        );
    }

    if (isEditorClone) {
        const sourceIdentity = cloneSourceNode
            ? String(
                cloneSourceNode.data?.fullSkillName ||
                cloneSourceNode.data?.label ||
                cloneSourceNode.id
            )
                .split(".")
                .pop()
            : "Original state not found";

        return (
            <aside className="details-panel">
                <h3>Details: {selectedNode.data?.label || "State Reference"}</h3>

                {tabBar}

                <div
                    className="tab-content"
                    id="details-tab-panel"
                    role="tabpanel"
                    aria-labelledby="details-tab-allgemein"
                    tabIndex={0}
                >
                    <div className="allgemein-container">
                        <div className="description-header">
                            <h3>{isSkillClone ? "Skill Reference" : "State Reference"}</h3>
                        </div>

                        <div className="skill-clone-detail-card">
                            <div className="detail-card-title">Reference target</div>
                            <MetadataRow
                                label="Reference ID"
                                value={selectedReferenceId || "—"}
                            />
                            <button
                                type="button"
                                className="skill-clone-source-button"
                                disabled={!cloneSourceNode}
                                onClick={() =>
                                    cloneSourceNode &&
                                    onNavigateCloneSource?.(cloneSourceNode.id)
                                }
                                title={
                                    cloneSourceNode
                                        ? "Go to the original state"
                                        : "The original state no longer exists"
                                }
                            >
                                {sourceIdentity}
                            </button>
                            <div className="detail-description">
                                This is an editor-only inbound reference. Incoming
                                transitions target the original state in SCXML;
                                outgoing transitions remain on the original node.
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        );
    }


    return (
        <aside className="details-panel">
            <h3>Details: {selectedNode.data.label}</h3>

            {tabBar}

            <div
                className="tab-content"
                id="details-tab-panel"
                role="tabpanel"
                aria-labelledby={`details-tab-${visibleActiveTab}`}
                tabIndex={0}
            >
                {visibleActiveTab === "allgemein" && (
                    <GeneralDetailsSection
                        selectedNode={selectedNode}
                        hasInitialNode={hasInitialNode}
                        isSubMachine={isSubMachine}
                        isContainerState={isContainerState}
                        usesEditorInstanceId={usesEditorInstanceId}
                        skillDisplayName={skillDisplayName}
                        hasNopSend={hasNopSend}
                        editableExitTokens={editableExitTokens}
                        availableTargetNodes={availableTargetNodes}
                        skillOutgoingTransitions={skillOutgoingTransitions}
                        containerOutgoingTransitions={containerOutgoingTransitions}
                        parallelLanes={parallelLanes}
                        onSetInitial={onSetInitial}
                        onUpdateName={onUpdateName}
                        onUpdateNameCommit={onUpdateNameCommit}
                        onUpdateSrc={onUpdateSrc}
                        onSetEventTarget={onSetEventTarget}
                        onNavigateTransitionNode={onNavigateTransitionNode}
                        onHoverTransitionNode={onHoverTransitionNode}
                        onOpenTransitionPanel={onOpenTransitionPanel}
                        onAddParallelLane={onAddParallelLane}
                        onRenameParallelLane={onRenameParallelLane}
                        onMoveParallelLane={onMoveParallelLane}
                        onDeleteParallelLane={onDeleteParallelLane}
                    />
                )}

                {visibleActiveTab === "clones" && hasClones && (
                    <CloneReferencesSection
                        cloneNodes={cloneNodes}
                        onNavigateClone={onNavigateClone}
                    />
                )}

                {visibleActiveTab === "parameter" && !isSubMachine && !hidesParameterAndSlots && (
                    <ParametersSection
                        selectedNode={selectedNode}
                        valueVariables={actionValueVariables || globalDataModel || []}
                        onUpdateParameter={onUpdateParameter}
                    />
                )}

                {visibleActiveTab === "slots" && !isSubMachine && !hidesParameterAndSlots && (
                    <SlotsSection
                        selectedNode={selectedNode}
                        availableSlotPaths={availableSlotPaths}
                        onUpdateInSlotPath={onUpdateInSlotPath}
                        onUpdateOutSlotPath={onUpdateOutSlotPath}
                        onCheckSlots={onCheckSlots}
                    />
                )}

                {visibleActiveTab === "send" && isNopSkill && (
                    <NopSendEditor
                        nodeId={selectedNode.id}
                        events={selectedNode.data.behaviorExitEvents || []}
                        onChange={(events) =>
                            onUpdateSendEvents?.(selectedNode.id, events)
                        }
                    />
                )}

                {visibleActiveTab === "actions" && !hidesEntryExit && (
                    <StateActionsSection
                        selectedNode={selectedNode}
                        availableLocations={availableActionLocations}
                        valueVariables={actionValueVariables || globalDataModel || []}
                        onUpdateStateActions={onUpdateStateActions}
                    />
                )}
            </div>
        </aside>
    );
}

export default memo(DetailsPanel, areDetailsPanelPropsEqual);
