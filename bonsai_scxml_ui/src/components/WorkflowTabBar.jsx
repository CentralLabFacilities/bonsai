import { FiPlus, FiX } from "react-icons/fi";

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
}) {
    return (
        <div className="editor-header-intellij">
            <div className="editor-title-badge">
                <span>Node Editor</span>
            </div>

            <div className="intellij-tabs-container">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`intellij-tab ${activeTabId === tab.id ? "active" : ""}`}
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
                        <span>{tab.title}</span>
                        {tabs.length > 1 && (
                            <span
                                className="intellij-tab-close"
                                draggable={false}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) =>
                                    handleCloseTab(tab.id, event)
                                }
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
    );
}
