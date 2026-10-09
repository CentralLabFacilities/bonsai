import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertCircle, FiAlertTriangle, FiChevronDown, FiChevronLeft, FiChevronRight, FiFolder, FiPause, FiPlay, FiRefreshCw, FiSettings, FiSquare, FiX } from "react-icons/fi";
import { isTauri, openFile } from "../../tauri-client.js";
import { classifyWebCommanderMessages, getWebCommanderSnapshot, getWebCommanderStatus, loadWebCommander, requestWebCommander } from "../../utils/webCommander.js";
import { loadRuntimeConfiguration, saveRuntimeConfiguration } from "../../utils/editorPreferences.js";
import { Button, InlineFeedback, TextInput } from "../ui/index.js";

const STATUS_LABELS = {
    UNKNOWN: "Not initialized",
    LOADING: "Loading",
    INITIALIZED: "Ready",
    INITIALIZED_BUT_WARNINGS: "Ready with warnings",
    RUNNING: "Running",
    PAUSED: "Paused",
};

export default function RuntimeCommander({
    isOpen,
    onClose,
    workflowTab,
    workflowFingerprint,
    getTabSnapshot,
    getTabsSnapshot,
    getActiveDocumentIdentity,
    onExecutionUpdate,
    unresolvedStates = [],
    behaviorDirectories = [],
}) {
    const [configuration, setConfiguration] = useState(loadRuntimeConfiguration);
    const [forceConfigure, setForceConfigure] = useState(false);
    const [eventName, setEventName] = useState("");
    const [snapshot, setSnapshot] = useState(null);
    const [loadedWorkflow, setLoadedWorkflow] = useState(null);
    const [loadMessages, setLoadMessages] = useState([]);
    const [loadSucceeded, setLoadSucceeded] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followCamera, setFollowCamera] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [diagnosticsPopupOpen, setDiagnosticsPopupOpen] = useState(false);
    const [autoOpenSubMachines, setAutoOpenSubMachines] = useState(false);
    const [autoExpandCompounds, setAutoExpandCompounds] = useState(false);
    const [autoExpandParallels, setAutoExpandParallels] = useState(false);
    const [automaticEnabled, setAutomaticEnabled] = useState(null);
    const [error, setError] = useState("");
    const [statusError, setStatusError] = useState("");
    const [busyAction, setBusyAction] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isBrowsing, setIsBrowsing] = useState(false);
    const [previouslyOpen, setPreviouslyOpen] = useState(isOpen);
    const configurationRef = useRef(null);
    const panelRef = useRef(null);
    const openerRef = useRef(null);
    const ownerRef = useRef(null);
    const operationRef = useRef(null);
    const readRef = useRef(null);
    const browseRef = useRef(null);
    const loadedWorkflowRef = useRef(null);
    const followingRef = useRef(false);
    const followCameraRef = useRef(true);
    const displayOptionsRef = useRef({ autoOpenSubMachines: false, autoExpandCompounds: false, autoExpandParallels: false });
    const observedRunningRef = useRef(false);
    const eventRef = useRef(null);
    const id = useId();
    const shouldPoll = isOpen || isFollowing;

    const updateConfiguration = (path) => {
        setConfiguration(path);
        saveRuntimeConfiguration(path);
    };

    useLayoutEffect(() => {
        if (!isOpen) return;
        if (!panelRef.current?.contains(document.activeElement)) openerRef.current = document.activeElement;
        panelRef.current?.focus();
        return () => {
            if (browseRef.current) browseRef.current.cancelled = true;
            browseRef.current = null;
        };
    }, [isOpen]);

    const publishOptions = (changes) => {
        displayOptionsRef.current = { ...displayOptionsRef.current, ...changes };
        onExecutionUpdate?.({ workflow: loadedWorkflowRef.current, snapshot,
            following: followingRef.current, followCamera: followCameraRef.current,
            ...displayOptionsRef.current });
    };

    useLayoutEffect(() => {
        if (!shouldPoll) return;
        const owner = {};
        ownerRef.current = owner;
        return () => {
            if (ownerRef.current === owner) ownerRef.current = null;
            readRef.current?.controller.abort();
            readRef.current = null;
            operationRef.current?.controller.abort();
            operationRef.current = null;
            if (browseRef.current) browseRef.current.cancelled = true;
            browseRef.current = null;
        };
    }, [shouldPoll]);

    const refreshStatus = async () => {
        const owner = ownerRef.current;
        if (!owner) return;
        readRef.current?.controller.abort();
        const request = { controller: new AbortController() };
        readRef.current = request;
        setIsRefreshing(true);
        try {
            const next = await getWebCommanderSnapshot(request.controller.signal);
            if (ownerRef.current !== owner || readRef.current !== request) return;
            setSnapshot(next);
            setStatusError("");
            if (followingRef.current && ["RUNNING", "PAUSED"].includes(next.status)) observedRunningRef.current = true;
            else if (followingRef.current && observedRunningRef.current) {
                followingRef.current = false;
                observedRunningRef.current = false;
                setIsFollowing(false);
            }
            onExecutionUpdate?.({ workflow: loadedWorkflowRef.current, snapshot: next,
                following: followingRef.current, followCamera: followCameraRef.current,
                ...displayOptionsRef.current, event: eventRef.current });
            eventRef.current = null;
        } catch (reason) {
            if (ownerRef.current !== owner || readRef.current !== request || request.controller.signal.aborted) return;
            let status;
            try {
                status = await getWebCommanderStatus(request.controller.signal);
            } catch {
                // A stale status must not enable controls when the status endpoint also fails.
            }
            if (ownerRef.current !== owner || readRef.current !== request || request.controller.signal.aborted) return;
            onExecutionUpdate?.({ workflow: loadedWorkflowRef.current, snapshot: null, following: false,
                followCamera: followCameraRef.current, ...displayOptionsRef.current });
            if (status) {
                setSnapshot({ status, currentStates: [], stateIds: [], transitions: [], checkedAt: Date.now(), detailsUnavailable: true });
                setStatusError(`Engine status is available, but state/transition details could not be read. ${String(reason?.message || reason)}`);
            } else {
                setSnapshot((previous) => previous ? { ...previous, statusStale: true } : null);
                setStatusError(`Could not get engine status. ${String(reason?.message || reason)} Check that WebCommander is running on localhost:8080.`);
            }
        } finally {
            if (readRef.current === request) {
                readRef.current = null;
                if (ownerRef.current === owner) setIsRefreshing(false);
            }
        }
    };

    const pollStatus = useEffectEvent(() => {
        if (!operationRef.current && !readRef.current) void refreshStatus();
    });
    useEffect(() => {
        if (!shouldPoll) return;
        pollStatus();
        const timer = window.setInterval(pollStatus, isFollowing ? 500 : 2000);
        return () => window.clearInterval(timer);
    }, [shouldPoll, isFollowing]);

    const close = () => {
        if (operationRef.current) return;
        if (browseRef.current) browseRef.current.cancelled = true;
        if (panelRef.current?.contains(document.activeElement) && openerRef.current?.isConnected) {
            openerRef.current.focus();
        }
        onClose();
    };

    const chooseConfiguration = async () => {
        if (operationRef.current || browseRef.current) return;
        const owner = ownerRef.current;
        const request = { cancelled: false };
        browseRef.current = request;
        setIsBrowsing(true);
        try {
            const path = await openFile("Choose Bonsai configuration");
            if (ownerRef.current !== owner || request.cancelled || !path) return;
            updateConfiguration(path);
            setError("");
        } catch (reason) {
            if (ownerRef.current === owner && !request.cancelled) {
                setError(`Could not choose configuration. ${String(reason?.message || reason)} Enter a path or try Browse again.`);
            }
        } finally {
            if (browseRef.current === request) {
                browseRef.current = null;
                setIsBrowsing(false);
            }
        }
    };

    const execute = async (action, enabled) => {
        if (operationRef.current || browseRef.current || !ownerRef.current) return;
        const owner = ownerRef.current;
        const operation = { controller: new AbortController() };
        operationRef.current = operation;
        readRef.current?.controller.abort();
        readRef.current = null;
        setIsRefreshing(false);
        setBusyAction(action);
        setError("");
        let sent = false;
        try {
            if (action === "load") {
                const pathToConfig = configuration.trim();
                if (!pathToConfig) throw new Error("Choose a Bonsai configuration first.");
                const identity = getActiveDocumentIdentity();
                const workflow = getTabSnapshot();
                if (!workflow) throw new Error("Open a state machine first.");
                const tabsSnapshot = getTabsSnapshot?.() ?? [workflow];
                if (getActiveDocumentIdentity() !== identity) {
                    throw new Error("The open workflow changed before loading. Nothing was sent to the engine.");
                }
                if (ownerRef.current !== owner) return;
                const includeMapping = Object.fromEntries(behaviorDirectories
                    .filter((directory) => directory.key?.trim() && directory.path?.trim())
                    .map((directory) => [directory.key.trim(), directory.path.trim()]));
                sent = true;
                followingRef.current = false;
                observedRunningRef.current = false;
                eventRef.current = null;
                loadedWorkflowRef.current = null;
                setLoadedWorkflow(null);
                setIsFollowing(false);
                setLoadMessages([]);
                setLoadSucceeded(null);
                setDiagnosticsPopupOpen(false);
                setResultsOpen(false);
                setAutomaticEnabled(null);
                setSnapshot(null);
                setStatusError("");
                onExecutionUpdate?.({ workflow: null, snapshot: null, following: false,
                    followCamera: followCameraRef.current, ...displayOptionsRef.current });
                const result = await loadWebCommander({ pathToConfig, pathToTask: workflow.filePath || "", includeMapping, forceConfigure }, operation.controller.signal, workflow);
                if (ownerRef.current !== owner) return;
                const loaded = { ...workflow, generation: workflow.documentGeneration, configuration: pathToConfig, includeMapping };
                loadedWorkflowRef.current = loaded;
                setLoadedWorkflow(loaded);
                onExecutionUpdate?.({ workflow: loaded, tabsSnapshot, snapshot: null, following: false,
                    followCamera: followCameraRef.current, ...displayOptionsRef.current, action: "load" });
                setLoadMessages(result.messages);
                setLoadSucceeded(result.success);
                const severity = classifyWebCommanderMessages(result.messages);
                if (!result.success || severity.warnings.length || severity.errors.length) setDiagnosticsPopupOpen(true);

            } else {
                if (action === "start") {
                    const current = getTabSnapshot();
                    if (!loadedWorkflow || current?.id !== loadedWorkflow.id
                        || current.documentGeneration !== loadedWorkflow.generation
                        || current.fingerprint !== loadedWorkflow.fingerprint) {
                        throw new Error("Load the current version of the open state machine before starting it.");
                    }
                }
                // stop_events forwards its Boolean directly to enableAutomaticEvents.
                const body = action === "fire_event" ? eventName.trim()
                    : action === "stop_events" ? JSON.stringify(enabled) : undefined;
                if (action === "fire_event" && !body) throw new Error("Enter a transition event first.");
                sent = true;
                await requestWebCommander(action, { method: "POST", body, signal: operation.controller.signal });
                if (ownerRef.current !== owner) return;
                if (action === "stop_events") setAutomaticEnabled(enabled);
                if ((action === "start" || action === "resume") && loadedWorkflowRef.current) {
                    followingRef.current = true;
                    setIsFollowing(true);
                    onExecutionUpdate?.({ workflow: loadedWorkflowRef.current, snapshot: null, following: true,
                        followCamera: followCameraRef.current, ...displayOptionsRef.current, action });
                }
                if (action === "fire_event") eventRef.current = { name: body, sentAt: Date.now() };
                if (action === "stop") {
                    followingRef.current = false;
                    observedRunningRef.current = false;
                    setIsFollowing(false);
                    onExecutionUpdate?.({ workflow: null, snapshot: null, following: false,
                        followCamera: followCameraRef.current, ...displayOptionsRef.current });
                }

            }
            if (ownerRef.current === owner) await refreshStatus();
        } catch (reason) {
            if (ownerRef.current === owner) {
                const message = `${String(reason?.message || reason)}${sent ? " A request may have reached the engine. Refresh status before retrying." : ""}`;
                setError(message);
                if (action === "load") {
                    setLoadSucceeded(false);
                    setLoadMessages([`Error: ${message}`]);
                    setDiagnosticsPopupOpen(true);
                }
                if (sent) await refreshStatus();
            }
        } finally {
            if (operationRef.current === operation) {
                operationRef.current = null;
                if (ownerRef.current === owner) setBusyAction("");
            }
        }
    };

    if (previouslyOpen !== isOpen) {
        setPreviouslyOpen(isOpen);
        setIsBrowsing(false);
        if (!isFollowing) {
            setBusyAction("");
            setIsRefreshing(false);
            setSnapshot(null);
        }
    }
    if (!isOpen) return null;
    const busy = Boolean(busyAction);
    const ready = snapshot && !snapshot.statusStale && !["UNKNOWN", "LOADING"].includes(snapshot.status);
    const canControl = !busy && !isBrowsing && ready;
    const loadedCurrent = loadedWorkflow && workflowTab?.id === loadedWorkflow.id
        && workflowTab.documentGeneration === loadedWorkflow.generation
        && workflowFingerprint === loadedWorkflow.fingerprint;
    const canLoad = !busy && !isBrowsing && Boolean(configuration.trim())
        && !["RUNNING", "PAUSED", "LOADING"].includes(snapshot?.status);
    const diagnostics = classifyWebCommanderMessages(loadMessages);
    const totalIssues = diagnostics.warnings.length + diagnostics.errors.length + diagnostics.diagnostics.length;
    const statusLabel = snapshot ? STATUS_LABELS[snapshot.status] || snapshot.status : isRefreshing ? "Checking..." : "Disconnected";
    const statusTone = snapshot?.statusStale || statusError ? "warning" :
        snapshot?.status === "RUNNING" ? "running" : snapshot?.status === "PAUSED" ? "paused" :
            snapshot?.status === "INITIALIZED_BUT_WARNINGS" ? "warning" : "neutral";

    return createPortal(
        <>
            <section ref={panelRef} tabIndex={-1} role="region" aria-label="Run state machine" data-editor-shortcut-scope
                aria-busy={busy} className="runtime-commander-dialog nodrag nopan"
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                        if (diagnosticsPopupOpen) setDiagnosticsPopupOpen(false);
                        else if (optionsOpen) setOptionsOpen(false);
                        else close();
                    }
                }}>
                {optionsOpen && <div className="runtime-commander-drawer" id={`${id}-options`}>
                    <div className="runtime-commander-drawer-header">
                        <strong><FiSettings aria-hidden="true" /> Run options</strong>
                        <button type="button" className="runtime-commander-icon-button" onClick={() => setOptionsOpen(false)}
                            aria-label="Close options"><FiX /></button>
                    </div>
                    <div className="runtime-commander-drawer-body">
                        <section className="runtime-commander-section">
                            <h4>Configuration</h4>
                            <label className="runtime-commander-field">
                                <span>Configuration file</span>
                                <div className="runtime-commander-path-row">
                                    <TextInput ref={configurationRef} value={configuration} spellCheck={false}
                                        placeholder="/path/to/bonsai-config.xml" disabled={busy}
                                        onChange={(event) => {
                                            if (browseRef.current) browseRef.current.cancelled = true;
                                            updateConfiguration(event.target.value);
                                        }} />
                                    {isTauri() && <Button leadingIcon={<FiFolder />} onClick={chooseConfiguration}
                                        disabled={busy || isBrowsing}>Browse</Button>}
                                </div>
                            </label>
                            <div className="runtime-commander-field">
                                <span>Open state machine</span>
                                <strong className="runtime-commander-truncate" title={workflowTab?.filePath || ""}>
                                    {workflowTab?.fileName || workflowTab?.title || "No workflow open"}
                                </strong>
                            </div>
                            <label className="runtime-commander-switch">
                                <input type="checkbox" checked={forceConfigure} disabled={busy}
                                    onChange={(event) => setForceConfigure(event.target.checked)} />
                                <span>Force configuration reload</span>
                            </label>
                            <Button variant="primary" disabled={!canLoad} onClick={() => void execute("load")}
                                leadingIcon={<FiFolder />}>
                                {busyAction === "load" ? "Loading..." : "Load configuration and state machine"}
                            </Button>
                            {loadedWorkflow && !loadedCurrent &&
                                <InlineFeedback tone="warning">The open workflow has changed. Load the current version before Start.</InlineFeedback>}
                            {!["RUNNING", "PAUSED"].includes(snapshot?.status) ? null :
                                <p className="runtime-commander-note">Stop execution before loading another workflow.</p>}
                            <p className="runtime-commander-note">Loading uses the current editor snapshot, including unsaved changes.</p>
                            {behaviorDirectories.length > 0 && <p className="runtime-commander-note">Symbolic Sub-SM paths require an include mapping in WebCommander.</p>}
                        </section>
                        <section className="runtime-commander-section">
                            <h4>Live visualization</h4>
                            <div className="runtime-commander-choice" role="group" aria-label="Live navigation mode">
                                <button type="button" className={!followCamera ? "selected" : ""} aria-pressed={!followCamera}
                                    onClick={() => { setFollowCamera(false); followCameraRef.current = false; publishOptions({}); }}>
                                    Highlight only
                                </button>
                                <button type="button" className={followCamera ? "selected" : ""} aria-pressed={followCamera}
                                    onClick={() => { setFollowCamera(true); followCameraRef.current = true; publishOptions({}); }}>
                                    Follow focus
                                </button>
                            </div>
                            <div className="runtime-commander-toggle-stack" role="group" aria-label="Automatic navigation and expansion">
                                <button type="button" className="runtime-commander-toggle" aria-pressed={autoOpenSubMachines}
                                    onClick={() => { const next = !autoOpenSubMachines; setAutoOpenSubMachines(next); publishOptions({ autoOpenSubMachines: next }); }}>
                                    <span>Open sub-state machines</span><span className="runtime-commander-toggle-indicator">{autoOpenSubMachines ? "On" : "Off"}</span>
                                </button>
                                <button type="button" className="runtime-commander-toggle" aria-pressed={autoExpandCompounds}
                                    onClick={() => { const next = !autoExpandCompounds; setAutoExpandCompounds(next); publishOptions({ autoExpandCompounds: next }); }}>
                                    <span>Expand compounds</span><span className="runtime-commander-toggle-indicator">{autoExpandCompounds ? "On" : "Off"}</span>
                                </button>
                                <button type="button" className="runtime-commander-toggle" aria-pressed={autoExpandParallels}
                                    onClick={() => { const next = !autoExpandParallels; setAutoExpandParallels(next); publishOptions({ autoExpandParallels: next }); }}>
                                    <span>Expand parallels</span><span className="runtime-commander-toggle-indicator">{autoExpandParallels ? "On" : "Off"}</span>
                                </button>
                            </div>
                            <p className="runtime-commander-note">Container expansion is visual only and does not modify the saved state machine. Automatic sub-machine navigation requires Follow focus.</p>
                        </section>
                        <section className="runtime-commander-section">
                            <h4>Automatic events</h4>
                            <div className="runtime-commander-field">
                                <span>Automatic transition events</span>
                                <div className="runtime-commander-choice" role="group" aria-label="Automatic transition events">
                                    <button type="button" aria-pressed={automaticEnabled === true} className={automaticEnabled === true ? "selected" : ""}
                                        disabled={!canControl} onClick={() => void execute("stop_events", true)}>Enabled</button>
                                    <button type="button" aria-pressed={automaticEnabled === false} className={automaticEnabled === false ? "selected" : ""}
                                        disabled={!canControl} onClick={() => void execute("stop_events", false)}>Disabled</button>
                                </div>
                                {automaticEnabled === null && <p className="runtime-commander-note">The API does not report the current setting.</p>}
                            </div>
                        </section>
                        <section className="runtime-commander-section">
                            <h4>Loading results</h4>
                            <button type="button" className="runtime-commander-results-toggle"
                                aria-expanded={resultsOpen} aria-controls={`${id}-results`} onClick={() => setResultsOpen(!resultsOpen)}>
                                <span>{loadSucceeded === null ? "No load performed" : loadSucceeded ? "Last load completed" : "Last load reported issues"}</span>
                                {totalIssues > 0 && <span className="runtime-commander-count">{totalIssues}</span>}
                                {resultsOpen ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                            {resultsOpen && <div className="runtime-commander-results" id={`${id}-results`}>
                                {loadSucceeded === null && <p className="runtime-commander-note">Load a configuration and workflow to see its results.</p>}
                                {loadSucceeded === false && <InlineFeedback tone="warning">Loading reported issues. Check engine status before starting.</InlineFeedback>}
                                {totalIssues === 0 && loadSucceeded === true && <p>Loaded without reported diagnostics.</p>}
                                <LoadMessages diagnostics={diagnostics} />
                                {totalIssues > 0 && <Button size="sm" onClick={() => setDiagnosticsPopupOpen(true)}>View in popup</Button>}
                            </div>}
                        </section>
                        <section className="runtime-commander-section">
                            <div className="runtime-commander-status-heading">
                                <h4>Engine details</h4>
                                <button type="button" className="runtime-commander-icon-button" title="Refresh engine status"
                                    aria-label="Refresh engine status" disabled={busy || isRefreshing}
                                    onClick={() => void refreshStatus()}><FiRefreshCw /></button>
                            </div>
                            <dl className="runtime-commander-status">
                                <dt>Active states</dt>
                                <dd>{snapshot?.detailsUnavailable ? "Unavailable" : snapshot?.currentStates.length ?
                                    snapshot.currentStates.map((state) => <code key={state}>{state}</code>) : "None reported"}</dd>
                                <dt>States</dt><dd>{snapshot?.detailsUnavailable ? "Unavailable" : snapshot?.stateIds.length ?? "Unknown"}</dd>
                                <dt>Last checked</dt><dd>{snapshot ? new Date(snapshot.checkedAt).toLocaleTimeString() : "Not yet"}</dd>
                            </dl>
                            {isFollowing && unresolvedStates.length > 0 && <InlineFeedback tone="warning">Unmatched active states: {unresolvedStates.join(", ")}</InlineFeedback>}
                            {statusError && <InlineFeedback tone="warning">{statusError}</InlineFeedback>}
                        </section>
                    </div>
                </div>}
                <div className="runtime-commander-main">
                    <div className="runtime-commander-main-header">
                        <div className="runtime-log-file-info">
                            <strong>Run state machine</strong>
                            <span title={loadedWorkflow?.filePath || workflowTab?.filePath || ""}>
                                {loadedWorkflow?.fileName || workflowTab?.fileName || workflowTab?.title || "No workflow open"}
                            </span>
                        </div>
                        <span className={`runtime-commander-status-pill ${statusTone}`} role="status" aria-live="polite">
                            <span className="runtime-commander-status-dot" />{statusLabel}
                        </span>
                        {totalIssues > 0 && <button type="button" className="runtime-commander-issue-button"
                            title="View loading diagnostics" onClick={() => setDiagnosticsPopupOpen(true)}>
                            <FiAlertTriangle /> {totalIssues}
                        </button>}
                        <button type="button" className="runtime-commander-icon-button" aria-label="Close run panel"
                            title="Close run panel" disabled={busy} onClick={close}><FiX /></button>
                    </div>
                    <div className="runtime-log-controls runtime-commander-toolbar" aria-label="Execution controls">
                        <button type="button" className="runtime-log-play-button" onClick={() => void execute("start")}
                            disabled={!canControl || !loadedCurrent || !["INITIALIZED", "INITIALIZED_BUT_WARNINGS"].includes(snapshot?.status)}
                            title="Start"><FiPlay /><span>Start</span></button>
                        <button type="button" onClick={() => void execute("pause")}
                            disabled={!canControl || snapshot?.status !== "RUNNING"} title="Pause"><FiPause /><span>Pause</span></button>
                        <button type="button" onClick={() => void execute("resume")}
                            disabled={!canControl || snapshot?.status !== "PAUSED"} title="Resume"><FiPlay /><span>Resume</span></button>
                        <button type="button" onClick={() => void execute("stop")}
                            disabled={!canControl || !["RUNNING", "PAUSED"].includes(snapshot?.status)} title="Stop"><FiSquare /><span>Stop</span></button>
                    </div>
                    <form className="runtime-commander-manual-event" aria-label="Send a transition event"
                        onSubmit={(event) => { event.preventDefault(); if (canControl && eventName.trim()) void execute("fire_event"); }}>
                        <label htmlFor={`${id}-manual-event`}>Send event</label>
                        <TextInput id={`${id}-manual-event`} value={eventName}
                            onChange={(event) => setEventName(event.target.value)}
                            placeholder="Transition event (e.g. State.success)"
                            list={`${id}-events`} spellCheck={false} disabled={!canControl} />
                        <datalist id={`${id}-events`}>
                            {snapshot?.transitions.map((transition) => <option key={transition} value={transition} />)}
                        </datalist>
                        <Button type="submit" variant="primary" disabled={!canControl || !eventName.trim()}>Send</Button>
                    </form>
                    {(busy || error || (statusError && !optionsOpen)) &&
                        <div className="runtime-commander-footer" role="status">
                            {busy ? "Waiting for the engine..." : error || (statusError && !optionsOpen)}
                        </div>}
                </div>
                <button type="button" className="runtime-commander-ledge" aria-expanded={optionsOpen}
                    aria-controls={`${id}-options`} title={optionsOpen ? "Close run options" : "Open run options"}
                    onClick={() => setOptionsOpen(!optionsOpen)}>
                    <FiSettings aria-hidden="true" />
                    {optionsOpen ? <FiChevronRight aria-hidden="true" /> : <FiChevronLeft aria-hidden="true" />}
                    <span>Options</span>
                </button>
            </section>
            {diagnosticsPopupOpen && <div className="runtime-commander-popup-backdrop" onMouseDown={(event) => {
                if (event.target === event.currentTarget) setDiagnosticsPopupOpen(false);
            }}>
                <section className="runtime-commander-popup" role="dialog" aria-modal="true"
                    aria-labelledby={`${id}-diagnostics-title`} data-editor-shortcut-scope
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setDiagnosticsPopupOpen(false); }}>
                    <header>
                        <div><h3 id={`${id}-diagnostics-title`}>Loading results</h3>
                            <p>{loadSucceeded ? "The workflow was loaded with the following messages." : "The load reported issues."}</p></div>
                        <button type="button" className="runtime-commander-icon-button" autoFocus
                            aria-label="Close loading results" onClick={() => setDiagnosticsPopupOpen(false)}><FiX /></button>
                    </header>
                    <div className="runtime-commander-popup-body"><LoadMessages diagnostics={diagnostics} /></div>
                    <footer><Button onClick={() => setDiagnosticsPopupOpen(false)}>Close</Button></footer>
                </section>
            </div>}
        </>, document.body,
    );
}

function LoadMessages({ diagnostics }) {
    return <div className="runtime-commander-diagnostics">
        {diagnostics.errors.length > 0 && <div className="runtime-commander-diagnostic error">
            <strong><FiAlertCircle /> Errors ({diagnostics.errors.length})</strong>
            <ul>{diagnostics.errors.map((message, index) => <li key={index}>{message}</li>)}</ul>
        </div>}
        {diagnostics.warnings.length > 0 && <div className="runtime-commander-diagnostic warning">
            <strong><FiAlertTriangle /> Warnings ({diagnostics.warnings.length})</strong>
            <ul>{diagnostics.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul>
        </div>}
        {diagnostics.diagnostics.length > 0 && <div className="runtime-commander-diagnostic info">
            <strong>Other messages ({diagnostics.diagnostics.length})</strong>
            <ul>{diagnostics.diagnostics.map((message, index) => <li key={index}>{message}</li>)}</ul>
            <p>WebCommander did not provide severity for these messages.</p>
        </div>}
    </div>;
}
