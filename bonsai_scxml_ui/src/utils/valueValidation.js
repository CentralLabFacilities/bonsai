import {
    normalizeAssignmentExpressionInput,
    validateAssignmentExpression,
} from "./assignmentExpressions.js";
import {
    getVariableType,
    normalizeDatamodelValue,
    normalizeTypedValue,
    normalizeValueType,
} from "./valueTypes.js";

const findVariable = (variableOrId, variables = []) => {
    if (variableOrId && typeof variableOrId === "object") {
        return variableOrId;
    }

    const id = String(variableOrId || "").trim();
    if (!id) return null;

    return (Array.isArray(variables) ? variables : []).find(
        (variable) => String(variable?.id || "") === id
    ) || null;
};

/**
 * Canonical validator for typed scalar editor values.
 *
 * Every UI/editor write path that accepts Integer/Double/Boolean/String values
 * should go through this function (or one of the context helpers below) before
 * mutating semantic editor state. That keeps normalization and compatibility
 * rules independent from whichever component happens to edit the value.
 */
export function validateTypedValueInput(
    value,
    expectedType,
    variables = [],
    { allowEmpty = true } = {}
) {
    return normalizeTypedValue(value, expectedType, variables, { allowEmpty });
}

export function validateParameterValue(
    parameter,
    value,
    variables = [],
    { allowEmpty = true } = {}
) {
    const expectedType = normalizeValueType(parameter?.type);

    // Skill APIs may expose domain-specific/non-scalar parameter types. The
    // editor only owns scalar validation; unknown types remain backend-owned
    // and must not be rejected as though they were malformed scalar literals.
    if (!expectedType) {
        return {
            valid: true,
            value: String(value ?? "").trim(),
            type: parameter?.type || null,
            parameterKey: String(parameter?.key || ""),
            expectedType: parameter?.type || null,
        };
    }

    const result = validateTypedValueInput(
        value,
        expectedType,
        variables,
        { allowEmpty }
    );

    return {
        ...result,
        parameterKey: String(parameter?.key || ""),
        expectedType,
    };
}

export function validateParameterList(
    parameters = [],
    variables = [],
    { allowEmpty = true } = {}
) {
    const normalizedParameters = [];

    for (let index = 0; index < (Array.isArray(parameters) ? parameters : []).length; index += 1) {
        const parameter = parameters[index] || {};
        const result = validateParameterValue(
            parameter,
            parameter.expr ?? "",
            variables,
            { allowEmpty }
        );

        if (!result.valid) {
            return {
                valid: false,
                index,
                parameter,
                error: result.error || "Invalid parameter value.",
            };
        }

        normalizedParameters.push({
            ...parameter,
            expr: result.value,
        });
    }

    return {
        valid: true,
        parameters: normalizedParameters,
    };
}

export function normalizeDataModelValueInput(value) {
    return normalizeDatamodelValue(value);
}

export function validateConditionValue(
    value,
    variableOrId,
    variables = [],
    { allowEmpty = false } = {}
) {
    const variable = findVariable(variableOrId, variables);
    if (!variable) {
        return {
            valid: false,
            value: String(value ?? "").trim(),
            type: null,
            error: "Select a valid condition variable.",
        };
    }

    return validateTypedValueInput(
        value,
        getVariableType(variable),
        variables,
        { allowEmpty }
    );
}

export function validateAssignmentValue(
    expression,
    targetVariableOrId,
    variables = [],
    { allowEmpty = false, normalize = true } = {}
) {
    const targetVariable = findVariable(targetVariableOrId, variables);
    if (!targetVariable) {
        return {
            valid: false,
            value: String(expression ?? "").trim(),
            resultType: null,
            error: "Select variable",
        };
    }

    const normalizedExpression = normalize
        ? normalizeAssignmentExpressionInput(
              expression,
              targetVariable,
              variables
          )
        : String(expression ?? "").trim();

    const result = validateAssignmentExpression(
        normalizedExpression,
        targetVariable,
        variables,
        { allowEmpty }
    );

    return {
        ...result,
        value: result.valid ? result.value : normalizedExpression,
        targetVariable,
    };
}
