import { useCallback } from "react";

/** Workflow-level datamodel mutations used by WorkflowPanel. */
export function useEditorDataModelActions({
    globalDataModel,
    setGlobalDataModel,
}) {
    const updateGlobalParameter = useCallback(
        (index, expression) => {
            setGlobalDataModel((current) =>
                current.map((parameter, parameterIndex) =>
                    parameterIndex === index
                        ? { ...parameter, expr: expression }
                        : parameter
                )
            );
        },
        [setGlobalDataModel]
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

            setGlobalDataModel((current) => [
                ...current,
                { id: normalizedId, expr: expression },
            ]);
            return true;
        },
        [globalDataModel, setGlobalDataModel]
    );

    const deleteGlobalParameter = useCallback(
        (index) => {
            setGlobalDataModel((current) =>
                current.filter((_, parameterIndex) => parameterIndex !== index)
            );
        },
        [setGlobalDataModel]
    );

    return {
        updateGlobalParameter,
        addGlobalParameter,
        deleteGlobalParameter,
    };
}
