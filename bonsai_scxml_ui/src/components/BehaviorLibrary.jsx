import { useEffect, useMemo, useState } from "react";
import {
    FiChevronDown,
    FiChevronRight,
    FiFileText,
    FiFolder,
    FiFolderPlus,
    FiPlus,
    FiRefreshCw,
    FiSearch,
    FiTrash2,
} from "react-icons/fi";
import {
    listBehaviorDirectory,
    selectDirectory,
} from "../tauri-client.js";

const normalizeKey = (value) =>
    String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");

const filterEntries = (entries, searchText) => {
    const query = searchText.trim().toLowerCase();

    if (!query) return entries;

    return (entries || [])
        .map((entry) => {
            if (entry.kind === "directory") {
                const children = filterEntries(
                    entry.children || [],
                    searchText
                );
                const ownMatch = entry.name
                    .toLowerCase()
                    .includes(query);

                if (ownMatch || children.length > 0) {
                    return {
                        ...entry,
                        children,
                    };
                }

                return null;
            }

            return entry.name
                .toLowerCase()
                .includes(query)
                ? entry
                : null;
        })
        .filter(Boolean);
};

function BehaviorTreeEntry({
    entry,
    depth,
    expanded,
    setExpanded,
    onOpenBehavior,
}) {
    const isDirectory = entry.kind === "directory";
    const isExpanded = expanded.has(entry.path);

    if (isDirectory) {
        return (
            <>
                <button
                    type="button"
                    className="behavior-tree-row behavior-directory-row"
                    style={{
                        paddingLeft: `${10 + depth * 16}px`,
                    }}
                    onClick={() => {
                        setExpanded((previous) => {
                            const next = new Set(previous);
                            if (next.has(entry.path)) {
                                next.delete(entry.path);
                            } else {
                                next.add(entry.path);
                            }
                            return next;
                        });
                    }}
                >
                    <span className="behavior-tree-chevron">
                        {isExpanded ? (
                            <FiChevronDown />
                        ) : (
                            <FiChevronRight />
                        )}
                    </span>
                    <FiFolder className="behavior-tree-icon behavior-folder-icon" />
                    <span className="behavior-tree-name">
                        {entry.name}
                    </span>
                </button>

                {isExpanded &&
                    (entry.children || []).map((child) => (
                        <BehaviorTreeEntry
                            key={child.path}
                            entry={child}
                            depth={depth + 1}
                            expanded={expanded}
                            setExpanded={setExpanded}
                            onOpenBehavior={onOpenBehavior}
                        />
                    ))}
            </>
        );
    }

    return (
        <button
            type="button"
            className="behavior-tree-row behavior-file-row"
            style={{
                paddingLeft: `${28 + depth * 16}px`,
            }}
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(
                    "behavior",
                    JSON.stringify(entry)
                );
                event.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => onOpenBehavior?.(entry)}
            title={`${entry.source}\nDouble-click to open, or drag into the editor`}
        >
            <FiFileText className="behavior-tree-icon behavior-file-icon" />
            <span className="behavior-tree-name">
                {entry.name.replace(/\.(xml|scxml)$/i, "")}
            </span>
        </button>
    );
}

function BehaviorRoot({
    directory,
    onChange,
    onRemove,
    onOpenBehavior,
    searchText,
}) {
    const [entries, setEntries] = useState([]);
    const [expanded, setExpanded] = useState(new Set());
    const [rootExpanded, setRootExpanded] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const loadEntries = async () => {
        if (!directory.path) {
            setEntries([]);
            setError("No directory selected.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const result = await listBehaviorDirectory(
                directory.key,
                directory.path
            );
            setEntries(result || []);
        } catch (loadError) {
            console.error(
                `Could not load ${directory.key}:`,
                loadError
            );
            setEntries([]);
            setError(
                loadError?.message ||
                    String(loadError) ||
                    "Could not read directory."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEntries();
        // Reload whenever the key or path changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [directory.key, directory.path]);

    const visibleEntries = useMemo(
        () => filterEntries(entries, searchText),
        [entries, searchText]
    );

    const choosePath = async () => {
        const selected = await selectDirectory(
            `Select ${directory.key} Behavior Directory`
        );

        if (!selected) return;

        onChange({
            ...directory,
            path: selected,
        });
    };

    return (
        <section className="behavior-root">
            <div className="behavior-root-header">
                <button
                    type="button"
                    className="behavior-root-toggle"
                    onClick={() =>
                        setRootExpanded((value) => !value)
                    }
                >
                    {rootExpanded ? (
                        <FiChevronDown />
                    ) : (
                        <FiChevronRight />
                    )}
                    <span className="behavior-root-key">
                        {directory.key}
                    </span>
                </button>

                <div className="behavior-root-actions">
                    <button
                        type="button"
                        className="behavior-icon-button"
                        onClick={choosePath}
                        title="Choose directory"
                    >
                        <FiFolderPlus />
                    </button>
                    <button
                        type="button"
                        className="behavior-icon-button"
                        onClick={loadEntries}
                        title="Refresh"
                    >
                        <FiRefreshCw />
                    </button>
                    <button
                        type="button"
                        className="behavior-icon-button behavior-delete-button"
                        onClick={() =>
                            onRemove(directory.key)
                        }
                        title="Remove directory"
                    >
                        <FiTrash2 />
                    </button>
                </div>
            </div>

            <div className="behavior-root-path">
                {directory.path}
            </div>

            {rootExpanded && (
                <div className="behavior-root-content">
                    {loading && (
                        <div className="behavior-library-status">
                            Loading…
                        </div>
                    )}

                    {!loading && error && (
                        <div className="behavior-library-error">
                            {error}
                        </div>
                    )}

                    {!loading &&
                        !error &&
                        visibleEntries.length === 0 && (
                            <div className="behavior-library-status">
                                No SCXML files found.
                            </div>
                        )}

                    {!loading &&
                        !error &&
                        visibleEntries.map((entry) => (
                            <BehaviorTreeEntry
                                key={entry.path}
                                entry={entry}
                                depth={0}
                                expanded={expanded}
                                setExpanded={setExpanded}
                                onOpenBehavior={onOpenBehavior}
                            />
                        ))}
                </div>
            )}
        </section>
    );
}

export default function BehaviorLibrary({
    directories,
    onDirectoriesChange,
    onOpenBehavior,
    activeLibraryTab = "behaviors",
    onLibraryTabChange,
}) {
    const [searchText, setSearchText] = useState("");
    const [adding, setAdding] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [newPath, setNewPath] = useState("");
    const [addError, setAddError] = useState("");

    const updateDirectory = (updated) => {
        onDirectoriesChange(
            directories.map((directory) =>
                directory.key === updated.key
                    ? updated
                    : directory
            )
        );
    };

    const removeDirectory = (key) => {
        onDirectoriesChange(
            directories.filter(
                (directory) => directory.key !== key
            )
        );
    };

    const browseForNewPath = async () => {
        const selected = await selectDirectory(
            "Select Behavior Directory"
        );

        if (selected) {
            setNewPath(selected);
        }
    };

    const addDirectory = () => {
        const key = normalizeKey(newKey);
        const path = newPath.trim();

        if (!key) {
            setAddError("Enter a key.");
            return;
        }

        if (!path) {
            setAddError("Choose a directory.");
            return;
        }

        if (
            directories.some(
                (directory) => directory.key === key
            )
        ) {
            setAddError(`Key ${key} already exists.`);
            return;
        }

        onDirectoriesChange([
            ...directories,
            {
                key,
                path,
                isDefault: false,
            },
        ]);

        setNewKey("");
        setNewPath("");
        setAddError("");
        setAdding(false);
    };

    return (
        <aside className="skill-library behavior-library">
            <div className="library-mode-tabs">
                <button
                    type="button"
                    className={`library-mode-tab ${
                        activeLibraryTab === "skills"
                            ? "active"
                            : ""
                    }`}
                    onClick={() =>
                        onLibraryTabChange?.("skills")
                    }
                >
                    Skills
                </button>
                <button
                    type="button"
                    className={`library-mode-tab ${
                        activeLibraryTab === "behaviors"
                            ? "active"
                            : ""
                    }`}
                    onClick={() =>
                        onLibraryTabChange?.("behaviors")
                    }
                >
                    Behaviors
                </button>
            </div>

            <div className="behavior-library-title-row">
                <h3>Behavior Library</h3>
                <button
                    type="button"
                    className="behavior-add-root-button"
                    onClick={() => {
                        setAdding((value) => !value);
                        setAddError("");
                    }}
                    title="Add behavior directory"
                >
                    <FiPlus />
                    Directory
                </button>
            </div>

            <div className="search-container">
                <input
                    className="skill-search"
                    type="text"
                    placeholder="Search behaviors..."
                    value={searchText}
                    onChange={(event) =>
                        setSearchText(event.target.value)
                    }
                />
                <FiSearch className="search-icon" />
            </div>

            {adding && (
                <div className="behavior-add-form">
                    <input
                        className="behavior-key-input"
                        value={newKey}
                        onChange={(event) =>
                            setNewKey(
                                normalizeKey(event.target.value)
                            )
                        }
                        placeholder="KEY"
                    />

                    <div className="behavior-path-picker">
                        <input
                            className="behavior-path-input"
                            value={newPath}
                            onChange={(event) =>
                                setNewPath(event.target.value)
                            }
                            placeholder="/path/to/behaviors"
                        />
                        <button
                            type="button"
                            className="behavior-browse-button"
                            onClick={browseForNewPath}
                        >
                            Browse
                        </button>
                    </div>

                    {addError && (
                        <div className="behavior-add-error">
                            {addError}
                        </div>
                    )}

                    <div className="behavior-add-actions">
                        <button
                            type="button"
                            className="behavior-add-confirm"
                            onClick={addDirectory}
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            className="behavior-add-cancel"
                            onClick={() => {
                                setAdding(false);
                                setAddError("");
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="behavior-roots-list">
                {directories.length === 0 ? (
                    <div className="behavior-library-empty">
                        Add a directory to start browsing behaviors.
                    </div>
                ) : (
                    directories.map((directory) => (
                        <BehaviorRoot
                            key={directory.key}
                            directory={directory}
                            onChange={updateDirectory}
                            onRemove={removeDirectory}
                            onOpenBehavior={onOpenBehavior}
                            searchText={searchText}
                        />
                    ))
                )}
            </div>

            <div className="behavior-library-hint">
                Double-click a behavior to open it. Drag it into
                the editor to create a Sub-State-Machine.
            </div>
        </aside>
    );
}
