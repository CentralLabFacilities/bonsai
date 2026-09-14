import { deserializeScxmlValueForEditor } from "./valueTypes.js";

const hasValue = (value) =>
    value !== undefined && value !== null && String(value).trim() !== "";

export const getConfiguredAssignments = (assignments) =>
    (Array.isArray(assignments) ? assignments : []).filter(
        (assignment) => hasValue(assignment?.location) && hasValue(assignment?.expr)
    );

export const parseStateAssignments = (stateElement, actionName) =>
    Array.from(stateElement?.children || [])
        .filter((child) => child.localName === actionName)
        .flatMap((actionElement) =>
            Array.from(actionElement.children)
                .filter((child) => child.localName === "assign")
                .map((assignElement) => ({
                    location: assignElement.getAttribute("location")?.trim() || "",
                    expr: deserializeScxmlValueForEditor(
                        assignElement.getAttribute("expr")?.trim() || ""
                    ),
                }))
        );
