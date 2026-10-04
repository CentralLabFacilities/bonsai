import { FiX } from "react-icons/fi";
import { EmptyState, IconButton, TextInput } from "./ui/index.js";

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
        <div ref={panelRef} className="editor-find-overlay ui-popover nodrag nopan">
            <div className="editor-find-overlay__header">
                <TextInput
                    ref={inputRef}
                    className="editor-find-overlay__input"
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
                                setResultIndex((index) => (index + 1) % results.length);
                            }
                            return;
                        }

                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            if (results.length > 0) {
                                setResultIndex((index) => (index - 1 + results.length) % results.length);
                            }
                            return;
                        }

                        if (event.key === "Enter") {
                            event.preventDefault();
                            focusResult(results[resultIndex]);
                        }
                    }}
                    placeholder="Find skill or slot…"
                />
                <IconButton size="sm" onClick={onClose} title="Close (Esc)" aria-label="Close find">
                    <FiX size={16} aria-hidden="true" />
                </IconButton>
            </div>

            {query.trim() && (
                <div className="editor-find-overlay__results">
                    {results.length === 0 ? (
                        <EmptyState compact>No matching skill or slot.</EmptyState>
                    ) : (
                        results.map((result, index) => (
                            <button
                                key={`${result.kind}-${result.id}`}
                                type="button"
                                className={`editor-find-result ${index === resultIndex ? "is-active" : ""}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => focusResult(result)}
                            >
                                <span className="editor-find-result__kind">{result.kind}</span>
                                <span className="editor-find-result__content">
                                    <span className="editor-find-result__label">{result.label}</span>
                                    {result.detail && result.detail !== result.label && (
                                        <span className="editor-find-result__detail">{result.detail}</span>
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
