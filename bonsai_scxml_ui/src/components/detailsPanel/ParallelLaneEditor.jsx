import { useEffect, useState } from "react";
import { FiArrowDown, FiArrowUp, FiPlus, FiTrash2 } from "react-icons/fi";

function ParallelLaneRow({
                             lane,
                             index,
                             laneCount,
                             onRename,
                             onMove,
                             onDelete,
                         }) {
    const laneLabel = String(lane?.data?.label || `Lane_${index + 1}`);
    const [nameDraft, setNameDraft] = useState(laneLabel);

    useEffect(() => {
        // External lane renames reset the draft; typing alone must not reset it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNameDraft(laneLabel);
    }, [lane.id, laneLabel]);

    const commitName = () => {
        const nextName = String(nameDraft || "").trim();
        onRename?.(lane.id, nextName);
    };

    const childCount = Number(lane?.childCount || 0);

    return (
        <div className="parallel-lane-editor-card">
            <div className="parallel-lane-editor-index" aria-hidden="true">
                {index + 1}
            </div>

            <div className="parallel-lane-editor-main">
                <div className="parallel-lane-editor-label-row">
                    <span className="parallel-lane-editor-label">Lane name</span>
                    <span className="parallel-lane-editor-meta">
                        {childCount === 1 ? "1 state" : `${childCount} states`}
                    </span>
                </div>

                <input
                    className="parallel-lane-editor-input"
                    type="text"
                    value={nameDraft}
                    placeholder={`Lane_${index + 1}`}
                    spellCheck="false"
                    onChange={(event) => setNameDraft(event.target.value)}
                    onBlur={commitName}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            setNameDraft(laneLabel);
                            event.currentTarget.blur();
                        }
                    }}
                />
            </div>

            <div className="parallel-lane-editor-actions">
                <button
                    type="button"
                    className="parallel-lane-editor-action"
                    title="Move lane up"
                    aria-label={`Move ${laneLabel} up`}
                    disabled={index === 0}
                    onClick={() => onMove?.(lane.id, "up")}
                >
                    <FiArrowUp size={14} />
                </button>
                <button
                    type="button"
                    className="parallel-lane-editor-action"
                    title="Move lane down"
                    aria-label={`Move ${laneLabel} down`}
                    disabled={index >= laneCount - 1}
                    onClick={() => onMove?.(lane.id, "down")}
                >
                    <FiArrowDown size={14} />
                </button>
                <button
                    type="button"
                    className="parallel-lane-editor-action parallel-lane-editor-delete"
                    title={laneCount <= 1 ? "A parallel needs at least one lane" : "Delete lane and its contents"}
                    aria-label={`Delete ${laneLabel}`}
                    disabled={laneCount <= 1}
                    onClick={() => onDelete?.(lane.id)}
                >
                    <FiTrash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function ParallelLaneEditor({
                                lanes = [],
                                onAdd,
                                onRename,
                                onMove,
                                onDelete,
                            }) {
    return (
        <section className="parallel-lane-editor">
            <div className="parallel-lane-editor-header">
                <div>
                    <div className="parallel-lane-editor-title-row">
                        <h3>Lanes</h3>
                        <span className="parallel-lane-count-badge">{lanes.length}</span>
                    </div>
                    <p>
                        Rename and arrange the parallel branches. Reordering a lane keeps its states with it.
                    </p>
                </div>

                <button
                    type="button"
                    className="parallel-lane-add-button"
                    onClick={() => onAdd?.()}
                >
                    <FiPlus size={14} />
                    Add lane
                </button>
            </div>

            <div className="parallel-lane-editor-list">
                {lanes.map((lane, index) => (
                    <ParallelLaneRow
                        key={lane.id}
                        lane={lane}
                        index={index}
                        laneCount={lanes.length}
                        onRename={onRename}
                        onMove={onMove}
                        onDelete={onDelete}
                    />
                ))}

                {lanes.length === 0 && (
                    <div className="parallel-lane-editor-empty">
                        This parallel has no lanes yet. Add one to create its first branch.
                    </div>
                )}
            </div>
        </section>
    );
}

export default ParallelLaneEditor;
