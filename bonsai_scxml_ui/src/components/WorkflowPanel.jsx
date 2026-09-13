import { useMemo, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { FiX } from "react-icons/fi";

function WorkflowPanel({
                           globalDataModel,
                           inheritedGlobalDataModel = [],
                           descendantGlobalDataModel = [],
                           newParamId,
                           setNewParamId,
                           newParamExpr,
                           setNewParamExpr,
                           onUpdateGlobalParam,
                           onAddParameter,
                           onDeleteParameter,
                       }) {
    const [createGlobal, setCreateGlobal] = useState(false);

    const inheritedGlobalIds = useMemo(
        () =>
            new Set(
                (inheritedGlobalDataModel || []).map(
                    (parameter) => parameter.id
                )
            ),
        [inheritedGlobalDataModel]
    );

    const { globalParameters, localParameters } = useMemo(() => {
        const withOriginalIndex = (globalDataModel || []).map(
            (parameter, index) => ({
                parameter,
                index,
            })
        );

        return {
            globalParameters: withOriginalIndex.filter(({ parameter }) =>
                String(parameter.id || "").startsWith("_")
            ),
            localParameters: withOriginalIndex.filter(
                ({ parameter }) =>
                    !String(parameter.id || "").startsWith("_")
            ),
        };
    }, [globalDataModel]);

    const rawParameterId = newParamId.trim();

    const isNewParameterGlobal =
        createGlobal || rawParameterId.startsWith("_");

    const normalizedParameterId = rawParameterId
        ? isNewParameterGlobal
            ? `_${rawParameterId.replace(/^_+/, "")}`
            : rawParameterId
        : "";

    const parameterNameAlreadyExists = (globalDataModel || []).some(
        (parameter) => parameter.id === normalizedParameterId
    );

    const newParameterOverwrittenByParent =
        normalizedParameterId.startsWith("_") &&
        inheritedGlobalIds.has(normalizedParameterId);

    const handleAddParameter = () => {
        if (!normalizedParameterId || parameterNameAlreadyExists) {
            return;
        }

        onAddParameter(normalizedParameterId, newParamExpr);
        setCreateGlobal(false);
    };

    const handleNewParameterKeyDown = (event) => {
        if (event.key !== "Enter") return;

        event.preventDefault();
        handleAddParameter();
    };

    const renderOwnParameters = (
        parameters,
        emptyText,
        isGlobalSection = false
    ) => {
        if (parameters.length === 0) {
            return <div className="datamodel-empty">{emptyText}</div>;
        }

        return (
            <div className="datamodel-compact-list">
                {parameters.map(({ parameter, index }) => {
                    const overwrittenByParent =
                        isGlobalSection &&
                        inheritedGlobalIds.has(parameter.id);

                    return (
                        <div
                            className={`datamodel-compact-row ${
                                overwrittenByParent
                                    ? "datamodel-overwritten-parameter"
                                    : ""
                            }`}
                            key={`${parameter.id}-${index}`}
                        >
                            <div
                                className="datamodel-compact-id"
                                title={parameter.id}
                            >
                                {parameter.id}
                            </div>

                            <input
                                className="datamodel-compact-value-input"
                                type="text"
                                value={parameter.expr ?? ""}
                                onChange={(event) =>
                                    onUpdateGlobalParam(
                                        index,
                                        event.target.value
                                    )
                                }
                            />

                            <button
                                type="button"
                                className="datamodel-delete-button"
                                onClick={() => onDeleteParameter(index)}
                                title={`Delete ${parameter.id}`}
                                aria-label={`Delete ${parameter.id}`}
                            >
                                <FiX />
                            </button>

                            {overwrittenByParent && (
                                <div className="datamodel-row-message datamodel-overwrite-error">
                                    Overwritten by parent state machine
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderSourcedGlobals = () => {
        const hasInherited = inheritedGlobalDataModel.length > 0;
        const hasDescendants = descendantGlobalDataModel.length > 0;

        if (!hasInherited && !hasDescendants) {
            return null;
        }

        return (
            <div className="datamodel-parameter-section datamodel-sourced-section">
                <div className="datamodel-section-header">
                    <h3>Sourced Global Parameters</h3>
                </div>

                {hasInherited && (
                    <div className="datamodel-inherited-list">
                        {inheritedGlobalDataModel.map(
                            (parameter, index) => (
                                <div
                                    className="slot-text-field datamodel-inherited-parameter"
                                    key={`inherited-${parameter.id}-${index}`}
                                >
                                    <div className="datamodel-parameter-header">
                                        <h4>{parameter.id}</h4>

                                        <span className="datamodel-parent-badge">
                                            {parameter.inheritedFrom ||
                                                "Parent state machine"}
                                        </span>
                                    </div>

                                    <div className="datamodel-inherited-value">
                                        {parameter.expr ?? ""}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}

                {hasDescendants && (
                    <div className="datamodel-descendant-section">
                        <div className="datamodel-subsection-label">
                            From sub-state machines
                        </div>

                        <div className="datamodel-inherited-list">
                            {descendantGlobalDataModel.map(
                                (parameter, index) => (
                                    <div
                                        className="slot-text-field datamodel-descendant-parameter"
                                        key={`descendant-${parameter.sourceTabId || "sub"}-${parameter.id}-${index}`}
                                    >
                                        <div className="datamodel-parameter-header">
                                            <h4>{parameter.id}</h4>

                                            <span className="datamodel-child-badge">
                                                {parameter.definedIn ||
                                                    "Sub-state machine"}
                                            </span>
                                        </div>

                                        <div className="datamodel-inherited-value">
                                            {parameter.expr ?? ""}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className="workflow-panel">
            <div className="gobal-container">
                <div className="addparam-container datamodel-add-compact">
                    <div className="datamodel-add-topline">
                        <h4>Add new Parameter</h4>

                        <label className="datamodel-global-toggle">
                            <input
                                type="checkbox"
                                checked={createGlobal}
                                onChange={(event) =>
                                    setCreateGlobal(
                                        event.target.checked
                                    )
                                }
                            />
                            <span>Global</span>
                        </label>
                    </div>

                    <div className="datamodel-add-row">
                        <input
                            className="slot-field-edit"
                            type="text"
                            placeholder={
                                createGlobal
                                    ? "ID (_ added automatically)"
                                    : "ID"
                            }
                            value={newParamId}
                            onChange={(event) =>
                                setNewParamId(event.target.value)
                            }
                            onKeyDown={handleNewParameterKeyDown}
                        />

                        <input
                            className="slot-field-edit"
                            type="text"
                            placeholder="Expression"
                            value={newParamExpr}
                            onChange={(event) =>
                                setNewParamExpr(event.target.value)
                            }
                            onKeyDown={handleNewParameterKeyDown}
                        />

                        <button
                            className="datamodel-add-button"
                            onClick={handleAddParameter}
                            disabled={
                                !normalizedParameterId ||
                                parameterNameAlreadyExists
                            }
                            title="Add parameter"
                        >
                            <FaPlus />
                        </button>
                    </div>

                    {createGlobal &&
                        rawParameterId &&
                        !rawParameterId.startsWith("_") && (
                            <div className="datamodel-row-message datamodel-name-preview">
                                Will be created as{" "}
                                <strong>
                                    {normalizedParameterId}
                                </strong>
                            </div>
                        )}

                    {!createGlobal &&
                        rawParameterId.startsWith("_") && (
                            <div className="datamodel-row-message datamodel-name-preview">
                                This parameter will be global.
                            </div>
                        )}

                    {parameterNameAlreadyExists &&
                        normalizedParameterId && (
                            <div className="datamodel-row-message datamodel-name-error">
                                A parameter named{" "}
                                <strong>
                                    {normalizedParameterId}
                                </strong>{" "}
                                already exists.
                            </div>
                        )}

                    {!parameterNameAlreadyExists &&
                        newParameterOverwrittenByParent && (
                            <div className="datamodel-row-message datamodel-overwrite-error">
                                Overwritten by parent state machine
                            </div>
                        )}
                </div>

                {renderSourcedGlobals()}

                <div className="datamodel-parameter-section">
                    <div className="datamodel-section-header">
                        <h3>Global Parameters</h3>
                        <span className="datamodel-section-hint">
                            Names starting with _
                        </span>
                    </div>

                    {renderOwnParameters(
                        globalParameters,
                        "No global parameters defined in this state machine.",
                        true
                    )}
                </div>

                <div className="datamodel-parameter-section">
                    <div className="datamodel-section-header">
                        <h3>Local Parameters</h3>
                        <span className="datamodel-section-hint">
                            All other names
                        </span>
                    </div>

                    {renderOwnParameters(
                        localParameters,
                        "No local parameters."
                    )}
                </div>
            </div>
        </aside>
    );
}

export default WorkflowPanel;
