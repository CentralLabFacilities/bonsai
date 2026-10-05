import { lazy, Suspense, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button, InlineFeedback } from "../ui/index.js";

const ConditionModal = lazy(() => import("./ConditionModal.jsx"));
const CreateSlotModal = lazy(() => import("./CreateSlotModal.jsx"));
const CreateSubMachineModal = lazy(() => import("./CreateSubMachineModal.jsx"));
const EditorShortcutHelp = lazy(() => import("./EditorShortcutHelp.jsx"));
const HintPage = lazy(() => import("./HintPage.jsx"));

export function CreationDialog({
    children,
    className,
    labelledBy,
    describedBy,
    onCancel,
    busy = false,
    initialFocusRef,
    selectInitialFocus = false,
}) {
    const dialogRef = useRef(null);

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const previouslyFocused = document.activeElement;
        if (!dialog.open) dialog.showModal();

        const preferredFocus = initialFocusRef?.current;
        const initialFocus = preferredFocus && !preferredFocus.matches(":disabled")
            ? preferredFocus
            : dialog.querySelector("input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled)")
                || dialog.querySelector("button:not(:disabled)") || dialog;
        initialFocus.focus();
        if (selectInitialFocus) initialFocus.select?.();

        return () => {
            if (dialog.open) dialog.close();
            if (previouslyFocused?.isConnected && !previouslyFocused.matches(":disabled")
                && !previouslyFocused.closest('[hidden], [inert], [aria-hidden="true"]')) previouslyFocused.focus();
        };
    }, [initialFocusRef, selectInitialFocus]);

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (busy) dialog.focus();
        else if (document.activeElement === dialog) initialFocusRef?.current?.focus();
    }, [busy, initialFocusRef]);

    const cancel = () => {
        if (!busy) onCancel?.();
    };

    return createPortal(
        <dialog
            ref={dialogRef}
            className={`editor-creation-dialog${className ? ` ${className}` : ""}`}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-busy={busy}
            tabIndex={-1}
            onCancel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }}
            onClick={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget) cancel();
            }}
            onKeyDown={(event) => {
                if (event.defaultPrevented) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancel();
                    return;
                }
                if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;

                event.preventDefault();
                event.stopPropagation();
                const controls = [...event.currentTarget.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")]
                    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
                        && !element.closest("[hidden], [inert]") && element.type !== "hidden");
                if (controls.length === 0) {
                    event.currentTarget.focus();
                    return;
                }
                const currentIndex = controls.indexOf(document.activeElement);
                const nextIndex = currentIndex < 0
                    ? (event.shiftKey ? controls.length - 1 : 0)
                    : (currentIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
                controls[nextIndex].focus();
            }}
        >
            {children}
        </dialog>,
        document.body,
    );
}

function UnsavedWorkflowDialog({ title, action, busy, error, status, onResolve }) {
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
            {!busy && status && <p role="status">{status}</p>}
            {error && (
                <InlineFeedback tone="danger" className="workflow-unsaved-dialog-error">
                    {error}
                </InlineFeedback>
            )}
            <div className="workflow-unsaved-dialog-actions">
                <Button ref={cancelButtonRef} disabled={busy} onClick={() => resolveChoice("cancel")}>Cancel</Button>
                <Button variant="danger" className="workflow-unsaved-dialog-discard" disabled={busy} onClick={() => resolveChoice("discard")}>Discard</Button>
                <Button variant="primary" className="workflow-unsaved-dialog-save" disabled={busy} onClick={() => resolveChoice("save")}>Save</Button>
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
    const shortcutHelpId = useId();
    const shortcutHelpButtonRef = useRef(null);
    const pasteCancelButtonRef = useRef(null);

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

            <div
                className="nodrag nopan"
                onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) shortcuts.setIsOpen?.(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && shortcuts.isOpen) {
                        event.preventDefault();
                        event.stopPropagation();
                        shortcutHelpButtonRef.current?.focus();
                        shortcuts.setIsOpen?.(false);
                    }
                }}
                style={{ position: "fixed", right: 18, bottom: 18, zIndex: 5200 }}
            >
                <button
                    ref={shortcutHelpButtonRef}
                    type="button"
                    aria-label="Show keyboard shortcuts"
                    aria-expanded={Boolean(shortcuts.isOpen)}
                    aria-controls={shortcutHelpId}
                    title="Keyboard shortcuts"
                    onClick={() => shortcuts.setIsOpen?.(!shortcuts.isOpen)}
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
                    {"\u2328"}
                </button>
                <Suspense fallback={null}>
                    {shortcuts.isOpen && <EditorShortcutHelp id={shortcutHelpId} />}
                </Suspense>
            </div>

            {documentGuard && (
                <UnsavedWorkflowDialog key={`${documentGuard.tabId}:${documentGuard.action}`} {...documentGuard} />
            )}

            {paste.pending && (
                <CreationDialog
                    className="skill-paste-choice-overlay"
                    labelledBy="skill-paste-choice-title"
                    onCancel={paste.onCancel}
                    initialFocusRef={pasteCancelButtonRef}
                >
                    <div className="skill-paste-choice-dialog">
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
                        <button ref={pasteCancelButtonRef} type="button" className="skill-paste-choice-cancel" onClick={paste.onCancel}>Cancel</button>
                    </div>
                </CreationDialog>
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
