import { EDITOR_SHORTCUTS, FIND_SHORTCUTS } from "../utils/editorGraph";

export default function EditorShortcutHelp({ isOpen, setIsOpen }) {
    return (
        <div
            className="nodrag nopan"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            onFocusCapture={() => setIsOpen(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsOpen(false);
                }
            }}
            style={{
                position: "fixed",
                right: 18,
                bottom: 18,
                zIndex: 5200,
            }}
        >
            {isOpen && (
                <div
                    role="tooltip"
                    style={{
                        position: "absolute",
                        right: 0,
                        bottom: 44,
                        width: 360,
                        maxWidth: "calc(100vw - 36px)",
                        maxHeight: "min(650px, calc(100vh - 90px))",
                        overflowY: "auto",
                        padding: 12,
                        border: "1px solid #475569",
                        borderRadius: 9,
                        background: "#111827",
                        color: "#e2e8f0",
                        boxShadow: "0 14px 35px rgba(0, 0, 0, 0.38)",
                        fontSize: 12,
                        pointerEvents: "auto",
                    }}
                >
                    <div
                        style={{
                            marginBottom: 9,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#f8fafc",
                        }}
                    >
                        Keyboard shortcuts
                    </div>

                    {EDITOR_SHORTCUTS.map((shortcut) => (
                        <div
                            key={shortcut.keys}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "145px 1fr",
                                alignItems: "center",
                                gap: 10,
                                minHeight: 28,
                            }}
                        >
                            <kbd
                                style={{
                                    justifySelf: "start",
                                    padding: "3px 6px",
                                    border: "1px solid #475569",
                                    borderBottomColor: "#64748b",
                                    borderRadius: 5,
                                    background: "#0f172a",
                                    color: "#cbd5e1",
                                    fontFamily: "inherit",
                                    fontSize: 10,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {shortcut.keys}
                            </kbd>
                            <span style={{ color: "#cbd5e1" }}>
                                {shortcut.action}
                            </span>
                        </div>
                    ))}

                    <div
                        style={{
                            margin: "8px 0 5px",
                            paddingTop: 8,
                            borderTop: "1px solid #334155",
                            color: "#94a3b8",
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                        }}
                    >
                        In search
                    </div>

                    {FIND_SHORTCUTS.map((shortcut) => (
                        <div
                            key={shortcut.keys}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "145px 1fr",
                                alignItems: "center",
                                gap: 10,
                                minHeight: 26,
                            }}
                        >
                            <kbd
                                style={{
                                    justifySelf: "start",
                                    padding: "3px 6px",
                                    border: "1px solid #475569",
                                    borderRadius: 5,
                                    background: "#0f172a",
                                    color: "#cbd5e1",
                                    fontFamily: "inherit",
                                    fontSize: 10,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {shortcut.keys}
                            </kbd>
                            <span style={{ color: "#cbd5e1" }}>
                                {shortcut.action}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <button
                type="button"
                aria-label="Show keyboard shortcuts"
                aria-expanded={isOpen}
                title="Keyboard shortcuts"
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
                ⌨
            </button>
        </div>
    );
}
