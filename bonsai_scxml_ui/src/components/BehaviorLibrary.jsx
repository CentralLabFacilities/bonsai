import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { areBehaviorLibraryPropsEqual } from "./canvasLibraryProps.js";
import { Button, InlineFeedback, SegmentedButton, SegmentedControl, TextInput } from "./ui/index.js";

const normalizeKey = (value) =>
    String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");

const errorMessage = (error) =>
    String(error?.message || error || "").trim() || "Unknown error.";

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
    const source = useMemo(
        () => ({ key: directory.key, path: directory.path }),
        [directory.key, directory.path]
    );
    const [listing, setListing] = useState(() => ({
        source,
        revision: 0,
        entries: [],
        hasLoaded: false,
        loading: Boolean(source.path),
        error: "",
    }));
    const [picker, setPicker] = useState({ pending: false, error: "" });
    const [openError, setOpenError] = useState("");
    const pickerRequestRef = useRef(null);
    const openRequestRef = useRef(null);
    const changeRef = useRef({ directory, onChange });
    const [expanded, setExpanded] = useState(new Set());
    const [rootExpanded, setRootExpanded] = useState(true);

    useLayoutEffect(() => {
        // A picker completion must not restore roots removed while it was open.
        changeRef.current = { directory, onChange };
    });

    useLayoutEffect(() => () => {
        pickerRequestRef.current = null;
        openRequestRef.current = null;
    }, [source]);

    if (listing.source !== source) {
        setListing({
            source,
            revision: 0,
            entries: [],
            hasLoaded: false,
            loading: Boolean(source.path),
            error: "",
        });
        setPicker({ pending: false, error: "" });
        setOpenError("");
    }

    const loadEntries = () => {
        setListing((current) => ({
            ...current,
            revision: current.revision + 1,
            loading: Boolean(source.path),
        }));
    };

    const { entries, hasLoaded, loading, error, revision } = listing;

    useEffect(() => {
        if (!source.path) return undefined;
        let cancelled = false;

        const readDirectory = async () => {
            let nextEntries = [];
            let nextError = "";
            try {
                nextEntries = await listBehaviorDirectory(source.key, source.path);
                if (!Array.isArray(nextEntries)) {
                    throw new Error("Invalid directory listing.");
                }
            } catch (loadError) {
                if (cancelled) return;
                console.error(`Could not load ${source.key}:`, loadError);
                nextError = errorMessage(loadError);
            }

            if (!cancelled) {
                setListing((current) => {
                    if (current.source !== source || current.revision !== revision) return current;
                    return {
                        ...current,
                        entries: nextError ? current.entries : nextEntries,
                        hasLoaded: current.hasLoaded || !nextError,
                        error: nextError,
                        loading: false,
                    };
                });
            }
        };

        void readDirectory();
        return () => {
            cancelled = true;
        };
    }, [source, revision]);

    const visibleEntries = useMemo(
        () => filterEntries(entries, searchText),
        [entries, searchText]
    );

    const choosePath = async () => {
        if (pickerRequestRef.current) return;
        const request = {};
        pickerRequestRef.current = request;
        setPicker((current) => ({ ...current, pending: true }));
        try {
            const selected = await selectDirectory(
                `Select ${directory.key} Behavior Directory`
            );
            if (pickerRequestRef.current !== request || !selected) return;
            setPicker({ pending: true, error: "" });
            changeRef.current.onChange({
                ...changeRef.current.directory,
                path: selected,
            });
        } catch (pickError) {
            if (pickerRequestRef.current !== request) return;
            setPicker({
                pending: true,
                error: `Could not choose directory. ${errorMessage(pickError)} Retry with Choose directory.`,
            });
        } finally {
            if (pickerRequestRef.current === request) {
                pickerRequestRef.current = null;
                setPicker((current) => ({ ...current, pending: false }));
            }
        }
    };

    const openBehavior = async (entry) => {
        const request = {};
        openRequestRef.current = request;
        try {
            await onOpenBehavior?.(entry);
            if (openRequestRef.current === request) setOpenError("");
        } catch (behaviorError) {
            if (openRequestRef.current === request) {
                setOpenError(`Could not open ${entry.name}. ${errorMessage(behaviorError)} Double-click this behavior to retry.`);
            }
        } finally {
            if (openRequestRef.current === request) openRequestRef.current = null;
        }
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
                        disabled={picker.pending}
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
                        onClick={() => {
                            pickerRequestRef.current = null;
                            openRequestRef.current = null;
                            onRemove(directory.key);
                        }}
                        title="Remove directory"
                    >
                        <FiTrash2 />
                    </button>
                </div>
            </div>

            <div className="behavior-root-path">
                {directory.path}
            </div>

            {picker.error && (
                <InlineFeedback compact tone="danger" className="behavior-library-error">
                    {picker.error}
                </InlineFeedback>
            )}

            {openError && (
                <InlineFeedback compact tone="danger" className="behavior-library-error">
                    {openError}
                </InlineFeedback>
            )}

            {rootExpanded && (
                <div className="behavior-root-content">
                    {!source.path && (
                        <div className="behavior-library-status">
                            No directory selected. Use Choose directory.
                        </div>
                    )}

                    {loading && (
                        <div className="behavior-library-status" role="status">
                            {hasLoaded ? "Refreshing..." : "Loading..."}
                        </div>
                    )}

                    {error && (
                        <InlineFeedback compact tone="danger" className="behavior-library-error">
                            Could not read directory. {error} Retry with Refresh or Choose directory.
                        </InlineFeedback>
                    )}

                    {hasLoaded && (loading || error) && (
                        <div className="behavior-library-status behavior-library-cached" role="status">
                            Showing cached directory listing.
                        </div>
                    )}

                    {hasLoaded &&
                        !loading &&
                        !error &&
                        entries.length === 0 && (
                            <div className="behavior-library-status">
                                No SCXML files found.
                            </div>
                        )}

                    {hasLoaded && entries.length > 0 && visibleEntries.length === 0 && (
                        <div className="behavior-library-status">
                            No behaviors match your search.
                        </div>
                    )}

                    {hasLoaded &&
                        visibleEntries.map((entry) => (
                            <BehaviorTreeEntry
                                key={entry.path}
                                entry={entry}
                                depth={0}
                                expanded={expanded}
                                setExpanded={setExpanded}
                                onOpenBehavior={openBehavior}
                            />
                        ))}
                </div>
            )}
        </section>
    );
}

function BehaviorLibrary({
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
    const [newPathPicker, setNewPathPicker] = useState({ pending: false, error: "" });
    const newPathRequestRef = useRef(null);

    useLayoutEffect(() => () => {
        newPathRequestRef.current = null;
    }, []);

    const resetNewPathPicker = () => {
        newPathRequestRef.current = null;
        setNewPathPicker({ pending: false, error: "" });
    };

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
        if (newPathRequestRef.current) return;
        const request = {};
        newPathRequestRef.current = request;
        setNewPathPicker((current) => ({ ...current, pending: true }));
        try {
            const selected = await selectDirectory("Select Behavior Directory");
            if (newPathRequestRef.current !== request || !selected) return;
            setNewPath(selected);
            setNewPathPicker({ pending: true, error: "" });
        } catch (pickError) {
            if (newPathRequestRef.current !== request) return;
            setNewPathPicker({
                pending: true,
                error: `Could not choose directory. ${errorMessage(pickError)} Retry with Browse or enter a path.`,
            });
        } finally {
            if (newPathRequestRef.current === request) {
                newPathRequestRef.current = null;
                setNewPathPicker((current) => ({ ...current, pending: false }));
            }
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
        resetNewPathPicker();
        setAdding(false);
    };

    return (
        <aside className="skill-library behavior-library">
            <SegmentedControl className="library-mode-tabs" aria-label="Library type">
                <SegmentedButton
                    className="library-mode-tab"
                    active={activeLibraryTab === "skills"}
                    onClick={() => onLibraryTabChange?.("skills")}
                >
                    Skills
                </SegmentedButton>
                <SegmentedButton
                    className="library-mode-tab"
                    active={activeLibraryTab === "behaviors"}
                    onClick={() => onLibraryTabChange?.("behaviors")}
                >
                    Behaviors
                </SegmentedButton>
            </SegmentedControl>

            <div className="behavior-library-title-row">
                <h3>Behavior Library</h3>
                <Button
                    size="sm"
                    className="behavior-add-root-button"
                    leadingIcon={<FiPlus />}
                    onClick={() => {
                        resetNewPathPicker();
                        setAdding((value) => !value);
                        setAddError("");
                    }}
                    title="Add behavior directory"
                >
                    Directory
                </Button>
            </div>

            <div className="search-container">
                <TextInput
                    className="skill-search"
                    type="text"
                    placeholder="Search behaviors..."
                    aria-label="Search behaviors"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                />
                <FiSearch className="search-icon" />
            </div>

            {adding && (
                <div className="behavior-add-form">
                    <TextInput
                        className="behavior-key-input"
                        value={newKey}
                        onChange={(event) => {
                            resetNewPathPicker();
                            setNewKey(normalizeKey(event.target.value));
                        }}
                        placeholder="KEY"
                    />

                    <div className="behavior-path-picker">
                        <TextInput
                            className="behavior-path-input"
                            value={newPath}
                            onChange={(event) => {
                                resetNewPathPicker();
                                setNewPath(event.target.value);
                            }}
                            placeholder="/path/to/behaviors"
                        />
                        <Button
                            size="sm"
                            className="behavior-browse-button"
                            onClick={browseForNewPath}
                            disabled={newPathPicker.pending}
                        >
                            Browse
                        </Button>
                    </div>

                    {(newPathPicker.error || addError) && (
                        <InlineFeedback compact tone="danger" className="behavior-add-error">
                            {newPathPicker.error}
                            {newPathPicker.error && addError && " "}
                            {addError}
                        </InlineFeedback>
                    )}

                    <div className="behavior-add-actions">
                        <Button
                            size="sm"
                            variant="primary"
                            className="behavior-add-confirm"
                            onClick={addDirectory}
                        >
                            Add
                        </Button>
                        <Button
                            size="sm"
                            className="behavior-add-cancel"
                            onClick={() => {
                                resetNewPathPicker();
                                setAdding(false);
                                setAddError("");
                            }}
                        >
                            Cancel
                        </Button>
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

export default memo(BehaviorLibrary, areBehaviorLibraryPropsEqual);
