import { lazy, Suspense, useCallback, useState } from "react";
import ProblemsPanel from "./ProblemsPanel.jsx";
import RuntimeChangesPanel from "./RuntimeChangesPanel.jsx";
import WorkflowPanel from "./WorkflowPanel.jsx";

const DetailsPanel = lazy(() => import("./DetailsPanel.jsx"));

const handleInspectorTabKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

    const buttons = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;

    let nextIndex = null;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + buttons.length) % buttons.length;
    } else if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % buttons.length;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[nextIndex].focus();
    buttons[nextIndex].click();
};

function InspectorTab({ id, active, onClick, children }) {
    return (
        <button
            type="button"
            id={`inspector-tab-${id}`}
            role="tab"
            aria-selected={active}
            aria-controls="inspector-tab-panel"
            tabIndex={active ? 0 : -1}
            className={`right-panel-tab ${active ? "active" : ""}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export default function EditorInspectorPanel({
    rightPanelTab,
    setRightPanelTab,
    selection,
    dataModel,
    problems,
    runtime,
    details,
}) {
    const [newParamId, setNewParamId] = useState("");
    const [newParamExpr, setNewParamExpr] = useState("");
    const selectedNode = selection.selectedNode;
    const inspectorTab =
        rightPanelTab === "details" && !selectedNode ? "datamodel" : rightPanelTab;
    const addParameter = dataModel.onAddParameter;
    const setRuntimePanelOpen = runtime.setPanelOpen;

    const handleAddParameter = useCallback(
        (parameterId, parameterExpr) => {
            if (!String(parameterId || "").trim()) return;
            addParameter(parameterId, parameterExpr);
            setNewParamId("");
            setNewParamExpr("");
        },
        [addParameter],
    );
    const handleToggleRuntimePanel = useCallback(
        () => setRuntimePanelOpen((value) => !value),
        [setRuntimePanelOpen],
    );

    return (
        <div className="right-panel-shell">
            <div
                className="right-panel-tabs"
                role="tablist"
                aria-label="Inspector"
                onKeyDown={handleInspectorTabKeyDown}
            >
                <InspectorTab
                    id="datamodel"
                    active={inspectorTab === "datamodel"}
                    onClick={() => setRightPanelTab("datamodel")}
                >
                    Data
                </InspectorTab>

                {selectedNode && (
                    <InspectorTab
                        id="details"
                        active={inspectorTab === "details"}
                        onClick={() => setRightPanelTab("details")}
                    >
                        {selectedNode.type === "slot" ? "Slot Details" : "Skill Detail"}
                    </InspectorTab>
                )}

                <InspectorTab
                    id="problems"
                    active={inspectorTab === "problems"}
                    onClick={() => setRightPanelTab("problems")}
                >
                    <span>Problems</span>
                    {problems.items.length > 0 && (
                        <span
                            className={`right-panel-problem-count ${
                                problems.errorCount > 0 ? "has-errors" : "warnings-only"
                            }`}
                        >
                            {problems.items.length}
                        </span>
                    )}
                </InspectorTab>
            </div>

            {runtime.log && (
                <RuntimeChangesPanel
                    isOpen={runtime.panelOpen}
                    onToggle={handleToggleRuntimePanel}
                    playback={runtime.playback}
                    changes={runtime.changes}
                />
            )}

            <div
                className="right-panel-content"
                id="inspector-tab-panel"
                role="tabpanel"
                aria-labelledby={`inspector-tab-${inspectorTab}`}
                tabIndex={0}
            >
                {inspectorTab === "datamodel" && (
                    <WorkflowPanel
                        globalDataModel={dataModel.global}
                        inheritedGlobalDataModel={dataModel.inherited}
                        descendantGlobalDataModel={dataModel.descendant}
                        newParamId={newParamId}
                        setNewParamId={setNewParamId}
                        newParamExpr={newParamExpr}
                        setNewParamExpr={setNewParamExpr}
                        onUpdateGlobalParam={dataModel.onUpdateParameter}
                        onAddParameter={handleAddParameter}
                        onDeleteParameter={dataModel.onDeleteParameter}
                    />
                )}

                {inspectorTab === "problems" && (
                    <ProblemsPanel problems={problems.items} validationStatus={problems.status} onProblemClick={problems.onClick} />
                )}

                {inspectorTab === "details" && selectedNode && (
                    <Suspense fallback={null}>
                        <DetailsPanel
                            {...details.callbacks}
                            selectedNode={selectedNode}
                            cloneSourceNode={selection.cloneSourceNode}
                            cloneNodes={selection.cloneNodes}
                            containerOutgoingTransitions={selection.containerOutgoingTransitions}
                            parallelLanes={selection.parallelLanes}
                            hasInitialNode={selection.hasInitialNode}
                            activeTab={details.activeTab}
                            setActiveTab={details.setActiveTab}
                            availableTargetNodes={details.availableTargetNodes}
                            globalDataModel={selection.actionDataModel}
                            actionValueVariables={selection.actionExpressionVariables}
                            availableSlotPaths={details.availableSlotPaths}
                            slotDetails={selection.slotDetails}
                            parameterFocusRequest={details.parameterFocusRequest}
                            slotFocusRequest={details.slotFocusRequest}
                            transitionFocusRequest={details.transitionFocusRequest}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    );
}
