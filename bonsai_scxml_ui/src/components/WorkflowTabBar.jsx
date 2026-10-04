import { useEffect, useRef } from "react";
import { FiArrowLeft, FiArrowRight, FiPlus, FiX } from "react-icons/fi";

export default function WorkflowTabBar({
    tabs,
    activeTabId,
    draggedTabId,
    switchTab,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDragEnd,
    handleTabMiddleMouseDown,
    handleTabMouseEnter,
    handleTabMouseLeave,
    handleCloseTab,
    handleAddNewTab,
    canGoFocusBack = false,
    canGoFocusForward = false,
    onFocusBack,
    onFocusForward,
}) {
    const tabListRef = useRef(null);
    const focusedControlRef = useRef(null);

    useEffect(() => {
        const focusedControl = focusedControlRef.current;
        if (!focusedControl || focusedControl.isConnected) return;

        focusedControlRef.current = null;
        if (document.activeElement === document.body) {
            tabListRef.current
                ?.querySelector('[role="tab"][aria-selected="true"]')
                ?.focus();
        }
    }, [tabs, activeTabId]);

    const handleTabKeyDown = (event, index) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        let nextIndex;
        switch (event.key) {
            case "ArrowLeft":
                nextIndex = (index - 1 + tabs.length) % tabs.length;
                break;
            case "ArrowRight":
                nextIndex = (index + 1) % tabs.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = tabs.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        event.stopPropagation();
        tabListRef.current.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
        switchTab(tabs[nextIndex].id);
    };

    return (
        <div className="editor-header-intellij">
            <div className="focus-history-controls">
                <button
                    type="button"
                    className="focus-history-button"
                    onClick={onFocusBack}
                    disabled={!canGoFocusBack}
                    title="Previous focus (Alt+Left)"
                    aria-label="Previous focus"
                >
                    <FiArrowLeft />
                </button>
                <button
                    type="button"
                    className="focus-history-button"
                    onClick={onFocusForward}
                    disabled={!canGoFocusForward}
                    title="Next focus (Alt+Right)"
                    aria-label="Next focus"
                >
                    <FiArrowRight />
                </button>
            </div>

            <div className="editor-title-badge">
                <span>Node Editor</span>
            </div>

            <div
                ref={tabListRef}
                className="intellij-tabs-container"
                role="tablist"
                aria-label="Workflow tabs"
                onFocus={(event) => {
                    focusedControlRef.current = event.target;
                }}
                onBlur={(event) => {
                    // The unsaved-change guard temporarily owns the closing button's focus.
                    if (
                        !event.currentTarget.contains(event.relatedTarget) &&
                        !event.relatedTarget?.closest("[data-workflow-document-guard]")
                    ) {
                        focusedControlRef.current = null;
                    }
                }}
            >
                {tabs.map((tab, index) => (
                    <div
                        key={tab.id}
                        className={`intellij-tab ${activeTabId === tab.id ? "active" : ""}`}
                        role="presentation"
                        draggable
                        onDragStart={(event) =>
                            handleTabDragStart(event, tab.id)
                        }
                        onDragOver={(event) =>
                            handleTabDragOver(event, tab.id)
                        }
                        onDragEnd={handleTabDragEnd}
                        onDrop={(event) => event.preventDefault()}
                        onMouseDown={(event) =>
                            handleTabMiddleMouseDown(event, tab.id)
                        }
                        onClick={() => switchTab(tab.id)}
                        onMouseEnter={(event) =>
                            handleTabMouseEnter(event, tab)
                        }
                        onMouseLeave={handleTabMouseLeave}
                        style={{
                            opacity: draggedTabId === tab.id ? 0.55 : 1,
                        }}
                    >
                        <button
                            type="button"
                            className="intellij-tab-button"
                            id={`workflow-tab-${tab.id}`}
                            role="tab"
                            aria-selected={activeTabId === tab.id}
                            aria-controls="workflow-tab-panel"
                            tabIndex={activeTabId === tab.id ? 0 : -1}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                        >
                            <span>{tab.title}</span>
                            {tab.isModified && (
                                <span className="workflow-tab-modified-indicator" role="img" aria-label="Unsaved changes" title="Unsaved changes" />
                            )}
                        </button>
                        {tabs.length > 1 && (
                            <button
                                type="button"
                                className="intellij-tab-close"
                                draggable={false}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleCloseTab(tab.id, event);
                                }}
                                title="Close tab"
                                aria-label={`Close ${tab.title} tab`}
                            >
                                <FiX size={13} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                ))}

                <button
                    type="button"
                    className="intellij-add-btn"
                    onClick={handleAddNewTab}
                    title="Create new workflow tab"
                    aria-label="Create new workflow tab"
                >
                    <FiPlus aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
