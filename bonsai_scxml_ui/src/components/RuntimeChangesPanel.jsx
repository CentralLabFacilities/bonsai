import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function RuntimeChangesPanel({ isOpen, onToggle, playback, changes }) {
    return (
        <aside className={`runtime-changes-drawer ${isOpen ? "open" : "closed"}`} aria-label="Runtime changes">
            <button
                type="button"
                className="runtime-changes-drawer-ledge"
                onClick={onToggle}
                title={isOpen ? "Close runtime changes" : "Open runtime changes"}
                aria-expanded={isOpen}
            >
                {isOpen ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
            {isOpen && (
                <div className="runtime-changes-drawer-content">
                    <div className="runtime-changes-drawer-header">
                        <div>
                            <strong>Runtime changes</strong>
                            <span>
                                {playback.currentStep
                                    ? `Step ${playback.stepIndex + 1} \u00b7 ${playback.currentStep.timestamp}`
                                    : "No timestep selected"}
                            </span>
                        </div>
                        {playback.currentStep?.tabTitle && (
                            <span className="runtime-changes-context" title="State-machine tab used for this runtime step">
                                {playback.currentStep.tabTitle}
                            </span>
                        )}
                    </div>
                    {!changes ? (
                        <div className="runtime-changes-empty">
                            Start playback or click the timeline to inspect writes and assignments.
                        </div>
                    ) : (
                        <div className="runtime-changes-groups">
                            <ChangeGroup title="Slot writes" changes={changes.slotWrites} kind="slot" />
                            <ChangeGroup title="Variables" changes={changes.variables} kind="data" />
                            <ChangeGroup title="Parameters" changes={changes.parameters} kind="parameter" />
                            {changes.slotWrites.length === 0 && changes.variables.length === 0 && changes.parameters.length === 0 && (
                                <div className="runtime-changes-empty">
                                    No slot writes, variable changes, or parameter assignments in this step.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
}

function ChangeGroup({ title, changes, kind }) {
    if (changes.length === 0) return null;

    return (
        <section className="runtime-changes-group">
            <h4>{title}</h4>
            {changes.map((change) => {
                const isVariable = kind === "data";
                const key = kind === "slot"
                    ? change.paths?.length > 0
                        ? change.paths.join(", ")
                        : change.slotKey || change.localState || change.state
                    : isVariable ? change.localKey || change.key : change.key;
                const value = isVariable && change.evaluated ? change.evaluatedValue : change.value;
                const rowKey = isVariable
                    ? `data-${change.line}-${change.key}`
                    : `${kind}-${change.line}-${change.state}-${kind === "slot" ? change.value : change.key}`;

                return (
                    <div key={rowKey} className="runtime-change-row">
                        <div className="runtime-change-main">
                            <code>{key}</code>
                            <span className="runtime-change-arrow">&rarr;</span>
                            <strong>{String(value)}</strong>
                        </div>
                        <span className="runtime-change-meta">
                            {change.localState || change.state}
                            {isVariable && change.evaluated && change.previousValue !== undefined
                                ? ` \u00b7 previous: ${String(change.previousValue)}` : ""}
                            {isVariable && change.expr ? ` \u00b7 expr: ${change.expr}` : ""}
                            {isVariable && change.localKey && change.localKey !== change.key
                                ? ` \u00b7 runtime: ${change.key}` : ""}
                            {isVariable && !change.evaluated && change.evaluationError
                                ? ` \u00b7 could not evaluate: ${change.evaluationError}` : ""}
                        </span>
                    </div>
                );
            })}
        </section>
    );
}
