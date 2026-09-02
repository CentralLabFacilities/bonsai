import { FaPlus } from "react-icons/fa6";

function WorkflowPanel({ globalDataModel, newParamId, setNewParamId, newParamExpr, setNewParamExpr, onUpdateGlobalParam, onAddGlobalParam }) {
    return (
        <aside className="workflow-panel">
                    <div className="gobal-container">
                        <div className="slots-container">
                            <h3>Globales Datamodel</h3>

                            <div className="slot-list">
                                {globalDataModel.map((param, index) => (
                                    <div className="slot-text-field" key={param.id}>
                                        <h4>{param.id}</h4>

                                        <div className="slot-row">
                                            <input
                                                className="slot-field-edit"
                                                type="text"
                                                value={param.expr ?? ""}
                                                onChange={(e) =>
                                                    onUpdateGlobalParam(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                    </div>

                <div className="addparam-container">
                    <h4>Add new Parameter</h4>
                    <input
                        className="slot-field-edit"
                        type="text"
                        placeholder="Enter ID"
                        value={newParamId}
                        onChange={(e) => setNewParamId(e.target.value)}
                    />
                    <input
                        className="slot-field-edit"
                        type="text"
                        placeholder="Enter expr"
                        value={newParamExpr}
                        onChange={(e) => setNewParamExpr(e.target.value)}
                    />
                    <button className="filter-button" onClick={onAddGlobalParam}>
                        Add new parameter <FaPlus />
                    </button>
                </div>
            </div>
        </aside>
    );
}

export default WorkflowPanel;