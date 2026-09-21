import { FiX } from "react-icons/fi";

export default function EditorFindOverlay({
    isOpen,
    panelRef,
    inputRef,
    query,
    setQuery,
    results,
    resultIndex,
    setResultIndex,
    focusResult,
    onClose,
}) {
    if (!isOpen) return null;

    return (
        <div
            ref={panelRef}
            className="nodrag nopan"
            style={{
                position: "fixed",
                top: 72,
                right: 24,
                width: 360,
                maxWidth: "calc(100vw - 48px)",
                background: "#111827",
                border: "1px solid #475569",
                borderRadius: 8,
                boxShadow: "0 14px 35px rgba(0, 0, 0, 0.35)",
                zIndex: 5000,
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 8,
                    borderBottom: "1px solid #334155",
                }}
            >
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault();
                            onClose();
                            return;
                        }

                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            if (results.length > 0) {
                                setResultIndex((index) =>
                                    (index + 1) % results.length
                                );
                            }
                            return;
                        }

                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            if (results.length > 0) {
                                setResultIndex((index) =>
                                    (index - 1 + results.length) % results.length
                                );
                            }
                            return;
                        }

                        if (event.key === "Enter") {
                            event.preventDefault();
                            focusResult(results[resultIndex]);
                        }
                    }}
                    placeholder="Find skill or slot…"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "1px solid #475569",
                        background: "#0f172a",
                        color: "#e2e8f0",
                        outline: "none",
                    }}
                />
                <button
                    type="button"
                    onClick={onClose}
                    title="Close (Esc)"
                    style={{
                        border: 0,
                        background: "transparent",
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: 4,
                    }}
                >
                    <FiX size={16} />
                </button>
            </div>

            {query.trim() && (
                <div
                    style={{
                        maxHeight: 320,
                        overflowY: "auto",
                        padding: 4,
                    }}
                >
                {results.length === 0 ? (
                    <div
                        style={{
                            padding: "10px 12px",
                            color: "#94a3b8",
                            fontSize: 12,
                        }}
                    >
                        No matching skill or slot.
                    </div>
                ) : (
                    results.map((result, index) => (
                        <button
                            key={`${result.kind}-${result.id}`}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => focusResult(result)}
                            style={{
                                display: "flex",
                                width: "100%",
                                alignItems: "center",
                                gap: 10,
                                padding: "8px 10px",
                                border: 0,
                                borderRadius: 5,
                                background:
                                    index === resultIndex
                                        ? "#1e293b"
                                        : "transparent",
                                color: "#e2e8f0",
                                cursor: "pointer",
                                textAlign: "left",
                            }}
                        >
                            <span
                                style={{
                                    width: 58,
                                    flex: "0 0 58px",
                                    fontSize: 10,
                                    textTransform: "uppercase",
                                    color: "#94a3b8",
                                }}
                            >
                                {result.kind}
                            </span>
                            <span style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        fontSize: 12,
                                    }}
                                >
                                    {result.label}
                                </div>
                                {result.detail && result.detail !== result.label && (
                                    <div
                                        style={{
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            fontSize: 10,
                                            color: "#94a3b8",
                                        }}
                                    >
                                        {result.detail}
                                    </div>
                                )}
                            </span>
                        </button>
                    ))
                )}
                </div>
            )}
        </div>
    );
}
