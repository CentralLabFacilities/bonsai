import { FiPlus, FiTrash2 } from "react-icons/fi";

function StateActionsEditor({ actionName, actions, availableLocations, onChange, listId }) {
    const assignments = Array.isArray(actions) ? actions : [];
    const isEntry = actionName === "onentry";

    const updateAssignment = (index, changes) => {
        onChange(assignments.map((assignment, i) =>
            i === index ? { ...assignment, ...changes } : assignment
        ));
    };

    const removeAssignment = (index) => {
        onChange(assignments.filter((_, i) => i !== index));
    };

    return (
        <section className="state-action-editor">
            <div className="state-action-editor-header">
                <div>
                    <h3>&lt;{actionName}&gt;</h3>
                    <p>
                        Update data when this state is {isEntry ? "entered" : "exited"}.
                    </p>
                </div>
                <button
                    type="button"
                    className="state-action-add-button"
                    onClick={() => onChange([...assignments, { location: "", expr: "" }])}
                >
                    <FiPlus /> Assign
                </button>
            </div>

            {assignments.length === 0 ? (
                <div className="state-action-empty">No {actionName} assignments set.</div>
            ) : (
                <div className="state-action-list">
                    {assignments.map((assignment, index) => (
                        <div className="state-action-row" key={index}>
                            <div className="state-action-row-header">
                                <span>Assignment {index + 1}</span>
                                <button
                                    type="button"
                                    className="state-action-remove-button"
                                    title={`Remove ${actionName} assignment`}
                                    aria-label={`Remove ${actionName} assignment ${index + 1}`}
                                    onClick={() => removeAssignment(index)}
                                >
                                    <FiTrash2 />
                                </button>
                            </div>
                            <label className="state-action-field">
                                <span>Parameter / location</span>
                                <input
                                    className="slot-field-edit"
                                    type="text"
                                    list={listId}
                                    value={assignment.location || ""}
                                    placeholder="e.g. counter"
                                    onChange={(event) => updateAssignment(index, { location: event.target.value })}
                                />
                            </label>
                            <label className="state-action-field">
                                <span>New expression</span>
                                <input
                                    className="slot-field-edit"
                                    type="text"
                                    value={assignment.expr || ""}
                                    placeholder="e.g. counter + 1"
                                    onChange={(event) => updateAssignment(index, { expr: event.target.value })}
                                />
                            </label>
                        </div>
                    ))}
                </div>
            )}

            <datalist id={listId}>
                {availableLocations.map((location) => (
                    <option value={location} key={location} />
                ))}
            </datalist>
        </section>
    );
}

export default StateActionsEditor;
