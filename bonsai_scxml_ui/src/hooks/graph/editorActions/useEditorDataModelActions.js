import { useCallback } from "react";
import { buildRustDataModelEntries } from "../../../utils/scxmlRustExport";
import { normalizeDataModelValueInput } from "../../../utils/valueValidation.js";

/** Workflow-level datamodel mutations used by WorkflowPanel. */
export function useEditorDataModelActions({
    globalDataModel,
    setGlobalDataModel,
    applyWorkflowCommand,
}) {
    const syncDataModel = useCallback(
        (entries) => {
            void applyWorkflowCommand?.({
                type: "replaceDataModel",
                entries: buildRustDataModelEntries(entries),
            });
        },
        [applyWorkflowCommand]
    );

    const updateGlobalParameter = useCallback(
        (index, expression, commit = false) => {
            const nextExpression = commit
                ? normalizeDataModelValueInput(expression)
                : expression;
            const next = globalDataModel.map((parameter, parameterIndex) =>
                parameterIndex === index
                    ? { ...parameter, expr: nextExpression }
                    : parameter
            );
            setGlobalDataModel(next);
            if (commit) {
                syncDataModel(next);
            }
        },
        [globalDataModel, setGlobalDataModel, syncDataModel]
    );

    const addGlobalParameter = useCallback(
        (parameterId, expression) => {
            const normalizedId = String(parameterId || "").trim();
            if (!normalizedId) return false;
            if (
                globalDataModel.some(
                    (parameter) => parameter.id === normalizedId
                )
            ) {
                return false;
            }

            const next = [
                ...globalDataModel,
                {
                    id: normalizedId,
                    expr: normalizeDataModelValueInput(expression),
                },
            ];
            setGlobalDataModel(next);
            syncDataModel(next);
            return true;
        },
        [globalDataModel, setGlobalDataModel, syncDataModel]
    );

    const deleteGlobalParameter = useCallback(
        (index) => {
            const next = globalDataModel.filter(
                (_, parameterIndex) => parameterIndex !== index
            );
            setGlobalDataModel(next);
            syncDataModel(next);
        },
        [globalDataModel, setGlobalDataModel, syncDataModel]
    );

    return {
        updateGlobalParameter,
        addGlobalParameter,
        deleteGlobalParameter,
    };
}
