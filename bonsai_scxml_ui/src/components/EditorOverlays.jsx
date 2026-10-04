import { lazy, Suspense, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const ConditionModal = lazy(() => import("./ConditionModal.jsx"));
const CreateSlotModal = lazy(() => import("./CreateSlotModal.jsx"));
const CreateSubMachineModal = lazy(() => import("./CreateSubMachineModal.jsx"));
const EditorShortcutHelp = lazy(() => import("./EditorShortcutHelp.jsx"));
const HintPage = lazy(() => import("./HintPage.jsx"));

function UnsavedWorkflowDialog({ title, action, busy, error, onResolve }) {
    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const labelId = useId();

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const previouslyFocused = document.activeElement;
        if (!dialog.open) dialog.showModal();

        return () => {
            if (dialog.open) dialog.close();
            if (previouslyFocused?.isConnected) previouslyFocused.focus();
        };
    }, []);

    useLayoutEffect(() => {
        if (busy) dialogRef.current.focus();
        else cancelButtonRef.current.focus();
    }, [busy]);

    const resolveChoice = (choice) => {
        if (!busy) onResolve(choice);
    };

    return createPortal(
        <dialog
            ref={dialogRef}
            className="workflow-unsaved-dialog"
            data-workflow-document-guard=""
            aria-modal="true"
            aria-labelledby={`${labelId}-title`}
            aria-describedby={`${labelId}-description`}
            aria-busy={busy}
            tabIndex={-1}
            onCancel={(event) => {
                event.preventDefault();
                resolveChoice("cancel");
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    resolveChoice("cancel");
                    return;
                }
                if (event.key !== "Tab") return;

                event.preventDefault();
                event.stopPropagation();
                const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
                if (buttons.length === 0) {
                    event.currentTarget.focus();
                    return;
                }
                const currentIndex = buttons.indexOf(document.activeElement);
                const nextIndex = currentIndex < 0
                    ? (event.shiftKey ? buttons.length - 1 : 0)
                    : (currentIndex + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
                buttons[nextIndex].focus();
            }}
        >
            <h2 id={`${labelId}-title`}>Unsaved changes</h2>
            <p id={`${labelId}-description`}>
                Save changes to <strong>{title}</strong> before {action === "close" ? "closing this workflow" : "opening another workflow"}?
                {" "}Discarding will lose your unsaved changes.
            </p>
            {busy && <p role="status">Saving changes...</p>}
            {error && <p className="workflow-unsaved-dialog-error" role="alert">{error}</p>}
            <div className="workflow-unsaved-dialog-actions">
                <button ref={cancelButtonRef} type="button" disabled={busy} onClick={() => resolveChoice("cancel")}>Cancel</button>
                <button type="button" className="workflow-unsaved-dialog-discard" disabled={busy} onClick={() => resolveChoice("discard")}>Discard</button>
                <button type="button" className="workflow-unsaved-dialog-save" disabled={busy} onClick={() => resolveChoice("save")}>Save</button>
            </div>
        </dialog>,
        document.body,
    );
}

export default function EditorOverlays({
    loading,
    runtimePreparation,
    hint,
    subMachine,
    paste,
    shortcuts,
    tabPathTooltip,
    condition,
    slots,
    documentGuard = null,
}) {
    const progressPercent = Math.round(Math.max(0, Math.min(1, runtimePreparation?.progress || 0)) * 100);

    return (
        <>
            {loading && (
                <div className="state-machine-loading-overlay" role="status" aria-live="polite" aria-label={`Loading ${loading.label}`}>
                    <div className="state-machine-loading-card">
                        <div className="state-machine-loading-spinner" aria-hidden="true" />
                        <div className="state-machine-loading-title">Loading state machine</div>
                        <div className="state-machine-loading-label">{loading.label}</div>
                    </div>
                </div>
            )}
            {runtimePreparation && (
                <div
                    className="runtime-replay-loading-overlay"
                    role="status"
                    aria-live="polite"
                    aria-label={`Preparing runtime replay ${runtimePreparation.fileName || ""}`}
                >
                    <div className="runtime-replay-loading-card">
                        <div className="runtime-replay-loading-spinner" aria-hidden="true" />
                        <div className="runtime-replay-loading-title">Preparing runtime replay</div>
                        <div className="runtime-replay-loading-file">{runtimePreparation.fileName}</div>
                        <div className="runtime-replay-loading-phase">{runtimePreparation.phase}</div>
                        <div className="runtime-replay-loading-progress" aria-hidden="true">
                            <span style={{ width: `${Math.max(0, Math.min(1, runtimePreparation.progress || 0)) * 100}%` }} />
                        </div>
                        <div className="runtime-replay-loading-percent">{progressPercent}%</div>
                    </div>
                </div>
            )}

            <Suspense fallback={null}>
                {hint.isOpen && <HintPage onClose={hint.onClose} />}
                {subMachine.pending && (
                    <CreateSubMachineModal
                        isOpen
                        defaultDirectory={subMachine.pending.defaultDirectory || ""}
                        defaultFileName={subMachine.pending.defaultFileName || "SubMachine.xml"}
                        onCancel={subMachine.onCancel}
                        onConfirm={subMachine.onConfirm}
                    />
                )}
                {shortcuts.isOpen && <EditorShortcutHelp isOpen setIsOpen={shortcuts.setIsOpen} />}
                {condition.drawer.isOpen && (
                    <ConditionModal
                        isOpen
                        onClose={condition.onClose}
                        onConfirm={condition.onConfirm}
                        globalVariables={condition.variables}
                        sourceNodeName={condition.drawer.sourceNodeName}
                        sourceEventName={condition.drawer.sourceEventName}
                        candidateTransitions={condition.drawer.candidateTransitions}
                        availableEvents={condition.drawer.availableEvents}
                        availableTargets={condition.drawer.availableTargets}
                        initialTransitionId={condition.drawer.initialTransitionId}
                        initialTargetId={condition.drawer.initialTargetId}
                        targetOnlyMode={condition.drawer.targetOnlyMode}
                    />
                )}
                {slots.isOpen && (
                    <CreateSlotModal isOpen onClose={slots.onClose} onCreate={slots.onCreate} skillSlotOptions={slots.options} />
                )}
            </Suspense>

            {documentGuard && (
                <UnsavedWorkflowDialog key={`${documentGuard.tabId}:${documentGuard.action}`} {...documentGuard} />
            )}

            {paste.pending && (
                <div
                    className="skill-paste-choice-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) paste.onCancel();
                    }}
                >
                    <div className="skill-paste-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-paste-choice-title">
                        <h3 id="skill-paste-choice-title">Paste {paste.pending.sourceTypeLabel || "State"}</h3>
                        <p>How should <strong>{paste.pending.label}</strong> be pasted?</p>
                        <div className="skill-paste-choice-options">
                            <button type="button" className="skill-paste-choice-option" onClick={() => paste.onResolve("clone")}>
                                <span className="skill-paste-choice-option-title">Reference</span>
                                <span className="skill-paste-choice-option-description">Inbound-only reference to the original state.</span>
                            </button>
                            <button type="button" className="skill-paste-choice-option" onClick={() => paste.onResolve("copy")}>
                                <span className="skill-paste-choice-option-title">Copy</span>
                                <span className="skill-paste-choice-option-description">Create an independent copy of the selected state.</span>
                            </button>
                        </div>
                        <button type="button" className="skill-paste-choice-cancel" onClick={paste.onCancel}>Cancel</button>
                    </div>
                </div>
            )}

            {tabPathTooltip && createPortal(
                <div className="workflow-tab-path-tooltip" style={{ left: tabPathTooltip.left, top: tabPathTooltip.top }}>
                    {tabPathTooltip.path}
                </div>,
                document.body,
            )}
        </>
    );
}
