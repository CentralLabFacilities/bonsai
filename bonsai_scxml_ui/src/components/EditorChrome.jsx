import { useEffect, useRef } from "react";
import {
    FiFolder,
    FiSave,
    FiDownload,
    FiSidebar,
    FiSliders,
    FiX,
    FiChevronLeft,
    FiChevronRight,
    FiAlertCircle,
} from "react-icons/fi";
import { isTauri } from "../tauri-client.js";
import { PANEL_LIMITS } from "../utils/editorPreferences.js";
import { isDocumentGuardOpen } from "../hooks/interaction/useGlobalEditorShortcuts.js";
import { Button, IconButton } from "./ui/index.js";

function Header({ onOpenFile, onSaveFile, onSaveAsFile, hasFilePath, isSaving = false, isOpening = false, panels }) {
    const IS_DESKTOP = isTauri();

    return (
        <header className="header">
            <div className="header-left">
                <Button
                    size="sm"
                    className="menu-button"
                    leadingIcon={<FiFolder />}
                    onClick={() => void onOpenFile?.()}
                    disabled={isSaving || isOpening}
                >
                    {isOpening ? "Opening..." : "Open"}
                </Button>

                {/* Save button - direct save when a desktop path is known. */}
                {IS_DESKTOP && hasFilePath ? (
                    <Button
                        variant="primary"
                        size="sm"
                        className="menu-button highlight-save-button"
                        leadingIcon={<FiSave />}
                        onClick={() => void onSaveFile?.()}
                        disabled={isSaving || isOpening}
                    >
                        {isSaving ? "Saving…" : "Save"}
                    </Button>
                ) : null}

                {/* SCXML file operations require the desktop Rust backend. */}
                {IS_DESKTOP ? (
                    <Button
                        variant="primary"
                        size="sm"
                        className="menu-button highlight-save-button"
                        leadingIcon={<FiDownload />}
                        onClick={() => void onSaveAsFile?.()}
                        disabled={isSaving || isOpening}
                    >
                        Save as..
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        className="menu-button highlight-save-button"
                        leadingIcon={<FiSave />}
                        onClick={() => void onSaveFile?.()}
                        disabled={isSaving || isOpening}
                    >
                        {isSaving ? "Saving…" : "Save"}
                    </Button>
                )}

                <h2>Bonsai UI</h2>
            </div>
            {panels && (
                <nav className="header-panel-controls" aria-label="Editor panels">
                    {[
                        ["library", "Library", FiSidebar],
                        ["inspector", "Inspector", FiSliders],
                    ].map(([side, label, Icon]) => (
                        <Button
                            key={side}
                            size="sm"
                            className={`menu-button panel-toggle ${panels[`${side}Open`] ? "active" : ""}`}
                            leadingIcon={<Icon />}
                            aria-controls={`editor-${side}-panel`}
                            aria-expanded={panels[`${side}Open`]}
                            aria-label={`Toggle ${label.toLowerCase()}`}
                            title={`${panels[`${side}Open`] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                            onClick={() => panels.togglePanel(side)}
                        >
                            <span className="panel-toggle-text">{label}</span>
                        </Button>
                    ))}
                </nav>
            )}
        </header>
    );
}

export default Header;

export function EditorNotice({ notice, onDismiss, onRetry, onSaveAs }) {
    const noticeRef = useRef(null);
    const previousFocusRef = useRef(null);
    useEffect(() => {
        const active = document.activeElement;
        if (notice && active !== document.body && !noticeRef.current?.contains(active)) {
            previousFocusRef.current = active;
        }
    }, [notice]);
    if (!notice) return null;
    return (
        <section ref={noticeRef} className="editor-operation-notice" aria-label={notice.action === "insert" ? "Library insertion feedback" : "File operation feedback"}>
            <FiAlertCircle className="editor-notice-icon" aria-hidden="true" />
            <div className="editor-notice-message" role="alert" aria-atomic="true">
                <strong>{notice.title}</strong>
                <p>{notice.message}</p>
                <p className="editor-notice-guidance">
                    {notice.guidance || (notice.desktopRequired
                        ? "Use the Bonsai desktop app to open or save SCXML workflows."
                        : notice.action === "save"
                            ? "No successful save was reported. Check file permissions or use Save As."
                            : "Check the file and backend connection, then try again.")}
                </p>
                {!notice.canRetry && !notice.desktopRequired && notice.action !== "insert" && (
                    <p className="editor-notice-guidance">The originating workflow was closed or replaced. This operation cannot be retried here.</p>
                )}
            </div>
            <div className="editor-notice-actions">
                {notice.canRetry && (
                    <Button size="sm" disabled={notice.busy} onClick={() => void onRetry?.()}>
                        Retry {notice.action === "save" ? "Save" : "Open"}
                    </Button>
                )}
                {notice.canRetry && notice.action === "save" && (
                    <Button size="sm" disabled={notice.busy} onClick={() => void onSaveAs?.()}>Save As...</Button>
                )}
                <IconButton size="sm" className="editor-notice-dismiss" aria-label="Dismiss operation feedback" onClick={() => {
                    onDismiss?.();
                    const previous = previousFocusRef.current;
                    if (previous?.isConnected && !previous.matches(":disabled") && !previous.closest("[inert]")) previous.focus();
                    else document.querySelector('.intellij-tab-button[aria-selected="true"]')?.focus();
                }}>
                    <FiX aria-hidden="true" />
                </IconButton>
            </div>
        </section>
    );
}

export function EditorPanelLedge({ side, panels }) {
    const open = panels[`${side}Open`];
    const label = side === "library" ? "Library" : "Inspector";
    const Chevron = (side === "library") === open ? FiChevronLeft : FiChevronRight;
    return (
        <button
            type="button"
            className={`editor-panel-ledge editor-panel-ledge-${side}`}
            data-open={String(open)}
            aria-controls={`editor-${side}-panel`}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
            title={`${open ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
            onClick={() => panels.togglePanel(side)}
        >
            <Chevron aria-hidden="true" />
            <span className="editor-panel-ledge-label">{label}</span>
        </button>
    );
}

export function EditorPanel({ side, panels, children }) {
    const panel = useRef(null);
    const wasOpen = useRef(panels[`${side}Open`]);
    const previousFocus = useRef(null);
    const focusInside = useRef(false);
    const open = panels[`${side}Open`];
    const title = side === "library" ? "Library" : "Inspector";
    useEffect(() => {
        if (open && !wasOpen.current && !panels.isDocked) {
            previousFocus.current = document.activeElement;
            panel.current?.querySelector("input:not(:disabled), button:not(:disabled)")?.focus();
        } else if (
            !open &&
            wasOpen.current &&
            (focusInside.current || panel.current?.contains(document.activeElement))
        ) {
            if (previousFocus.current?.isConnected) previousFocus.current.focus();
            else document.querySelector(`[aria-controls="editor-${side}-panel"]`)?.focus();
            focusInside.current = false;
        }
        wasOpen.current = open;
    }, [open, panels.isDocked, side]);
    return (
        <aside
            ref={panel}
            id={`editor-${side}-panel`}
            className={`editor-side-panel editor-side-panel-${side}`}
            data-open={String(open)}
            aria-labelledby={`editor-${side}-heading`}
            aria-hidden={!open}
            inert={!open}
            onFocusCapture={() => {
                focusInside.current = true;
            }}
            onBlurCapture={(event) => {
                if (event.relatedTarget && !panel.current?.contains(event.relatedTarget))
                    focusInside.current = false;
            }}
            onDragStartCapture={side === "library" ? panels.onLibraryDragStart : undefined}
            onDragEndCapture={side === "library" ? panels.onLibraryDragEnd : undefined}
            onKeyDown={(event) => {
                if (
                    !panels.isDocked &&
                    event.key === "Escape" &&
                    !event.defaultPrevented &&
                    !isDocumentGuardOpen()
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    panels.closePanel(side);
                }
            }}
        >
            <div className="editor-side-panel-heading">
                <h2 id={`editor-${side}-heading`}>{title}</h2>
                <IconButton
                    size="sm"
                    className="editor-side-panel-close"
                    aria-label={`Close ${title.toLowerCase()}`}
                    onClick={() => panels.closePanel(side)}
                >
                    <FiX aria-hidden="true" />
                </IconButton>
            </div>
            <div className="editor-side-panel-body">{children}</div>
        </aside>
    );
}

export function EditorPanelResizer({ side, panels }) {
    const open = panels.isDocked && panels[`${side}Open`];
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${side}`}
            aria-controls={`editor-${side}-panel`}
            aria-valuemin={PANEL_LIMITS[side].min}
            aria-valuemax={Math.round(panels[`${side}MaxWidth`])}
            aria-valuenow={Math.round(panels[`${side}Width`])}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            className={`editor-panel-resize editor-panel-resize-${side}`}
            data-open={String(open)}
            onPointerDown={(event) => panels.startResize(side, event)}
            onPointerMove={panels.moveResize}
            onPointerUp={panels.finishResize}
            onPointerCancel={(event) => panels.finishResize(event, true)}
            onLostPointerCapture={(event) => panels.finishResize(event, true)}
            onKeyDown={(event) => panels.resizeKey(side, event)}
            onDoubleClick={() => panels.resetWidth(side)}
            title="Drag or use arrow keys to resize; double-click to reset"
        />
    );
}
