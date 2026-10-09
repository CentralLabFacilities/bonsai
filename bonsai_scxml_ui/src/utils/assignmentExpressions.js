import {
    VALUE_TYPES,
    getVariableType,
    isValueTypeCompatible,
    normalizeValueType,
} from "./valueTypes";

const UNKNOWN_TYPE = "Unknown";

const variableType = (variable) =>
    normalizeValueType(getVariableType(variable) || variable?.type) || UNKNOWN_TYPE;

const isNumeric = (type) =>
    type === VALUE_TYPES.INTEGER || type === VALUE_TYPES.DOUBLE;

const quoteStringLiteral = (value) => {
    const escaped = String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
    return `'${escaped}'`;
};

const isQuotedString = (value) => {
    const text = String(value || "").trim();
    return (
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('"') && text.endsWith('"'))
    );
};

const findVariable = (name, variables = []) =>
    (variables || []).find(
        (variable) => String(variable?.id || "") === String(name || "")
    );

const getReferenceType = (reference, variables = []) => {
    const match = String(reference || "").trim().match(/^@([A-Za-z_][A-Za-z0-9_.:]*)$/);
    if (!match) return UNKNOWN_TYPE;

    const variable = findVariable(match[1], variables);
    return variable ? variableType(variable) : UNKNOWN_TYPE;
};

export function normalizeAssignmentExpressionInput(
    expression,
    targetVariable,
    variables = []
) {
    let value = String(expression || "").trim();
    if (!value) return value;

    const targetType = variableType(targetVariable);

    // Direct String assignment: hello -> 'hello'
    if (
        targetType === VALUE_TYPES.STRING &&
        !value.startsWith("@") &&
        !isQuotedString(value) &&
        !/(==|!=|>=|<=|>|<|\+|-|\*|\/)/.test(value)
    ) {
        return quoteStringLiteral(value);
    }

    // String comparison: @status == done -> @status == 'done'
    const comparison = value.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
    if (comparison) {
        let [, left, operator, right] = comparison;
        left = left.trim();
        right = right.trim();

        const leftType = getReferenceType(left, variables);
        const rightType = getReferenceType(right, variables);

        if (
            leftType === VALUE_TYPES.STRING &&
            !right.startsWith("@") &&
            !isQuotedString(right)
        ) {
            right = quoteStringLiteral(right);
        } else if (
            rightType === VALUE_TYPES.STRING &&
            !left.startsWith("@") &&
            !isQuotedString(left)
        ) {
            left = quoteStringLiteral(left);
        }

        value = `${left} ${operator} ${right}`;
    }

    return value;
};

const operatorError = () => "Operator not allowed";

function tokenize(expression) {
    const tokens = [];
    let index = 0;

    const text = String(expression || "");

    while (index < text.length) {
        const char = text[index];

        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        const two = text.slice(index, index + 2);
        if (["==", "!=", ">=", "<="].includes(two)) {
            tokens.push({ kind: "operator", value: two });
            index += 2;
            continue;
        }

        if (["+", "-", "*", "/", ">", "<"].includes(char)) {
            tokens.push({ kind: "operator", value: char });
            index += 1;
            continue;
        }

        if (char === "(" || char === ")") {
            tokens.push({ kind: "paren", value: char });
            index += 1;
            continue;
        }

        if (char === "@") {
            const match = text.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_.:]*/);
            if (!match) {
                return {
                    valid: false,
                    error: "Invalid variable",
                };
            }

            tokens.push({ kind: "variable", value: match[0] });
            index += match[0].length + 1;
            continue;
        }

        if (char === "'" || char === '"') {
            const quote = char;
            let cursor = index + 1;
            let escaped = false;

            while (cursor < text.length) {
                const current = text[cursor];
                if (!escaped && current === quote) break;
                escaped = !escaped && current === "\\";
                if (current !== "\\") escaped = false;
                cursor += 1;
            }

            if (cursor >= text.length || text[cursor] !== quote) {
                return {
                    valid: false,
                    error: "Missing quote",
                };
            }

            tokens.push({
                kind: "literal",
                value: text.slice(index, cursor + 1),
                valueType: VALUE_TYPES.STRING,
            });
            index = cursor + 1;
            continue;
        }

        const rest = text.slice(index);
        const booleanMatch = rest.match(/^(true|false)\b/i);
        if (booleanMatch) {
            tokens.push({
                kind: "literal",
                value: booleanMatch[0],
                valueType: VALUE_TYPES.BOOLEAN,
            });
            index += booleanMatch[0].length;
            continue;
        }

        const numberMatch = rest.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (numberMatch) {
            const numberText = numberMatch[0];
            tokens.push({
                kind: "literal",
                value: numberText,
                valueType:
                    numberText.includes(".") || /[eE]/.test(numberText)
                        ? VALUE_TYPES.DOUBLE
                        : VALUE_TYPES.INTEGER,
            });
            index += numberText.length;
            continue;
        }

        const bareWord = rest.match(/^[A-Za-z_][A-Za-z0-9_.:]*/)?.[0];
        if (bareWord) {
            return {
                valid: false,
                error: "Wrong type",
            };
        }

        return {
            valid: false,
            error: "Invalid value",
        };
    }

    return { valid: true, tokens };
}

function inferExpressionType(expression, variables = []) {
    const tokenized = tokenize(expression);
    if (!tokenized.valid) return tokenized;

    const tokens = tokenized.tokens;
    let position = 0;

    const variablesById = new Map(
        (variables || [])
            .filter((variable) => variable?.id)
            .map((variable) => [String(variable.id), variable])
    );

    const applyOperator = (operator, leftType, rightType) => {
        if (["+", "-", "*", "/"].includes(operator)) {
            if (!isNumeric(leftType)) {
                return { valid: false, error: operatorError(operator, leftType) };
            }
            if (!isNumeric(rightType)) {
                return { valid: false, error: operatorError(operator, rightType) };
            }

            return {
                valid: true,
                type:
                    leftType === VALUE_TYPES.DOUBLE || rightType === VALUE_TYPES.DOUBLE
                        ? VALUE_TYPES.DOUBLE
                        : VALUE_TYPES.INTEGER,
            };
        }

        if ([">", "<", ">=", "<="].includes(operator)) {
            if (!isNumeric(leftType)) {
                return { valid: false, error: operatorError(operator, leftType) };
            }
            if (!isNumeric(rightType)) {
                return { valid: false, error: operatorError(operator, rightType) };
            }

            return { valid: true, type: VALUE_TYPES.BOOLEAN };
        }

        if (["==", "!="].includes(operator)) {
            const comparable =
                leftType === rightType ||
                (isNumeric(leftType) && isNumeric(rightType));

            if (!comparable) {
                return {
                    valid: false,
                    error: "Wrong type",
                };
            }

            return { valid: true, type: VALUE_TYPES.BOOLEAN };
        }

        return {
            valid: false,
            error: "Operator not allowed",
        };
    };

    const parsePrimary = () => {
        const token = tokens[position];
        if (!token) {
            return { valid: false, error: "Invalid value" };
        }

        if (token.kind === "operator" && ["+", "-"].includes(token.value)) {
            position += 1;
            const operand = parsePrimary();
            if (!operand.valid) return operand;
            if (!isNumeric(operand.type)) {
                return {
                    valid: false,
                    error: operatorError(token.value, operand.type),
                };
            }
            return operand;
        }

        if (token.kind === "paren" && token.value === "(") {
            position += 1;
            const nested = parseComparison();
            if (!nested.valid) return nested;

            if (tokens[position]?.kind !== "paren" || tokens[position]?.value !== ")") {
                return { valid: false, error: "Invalid value" };
            }
            position += 1;
            return nested;
        }

        if (token.kind === "variable") {
            position += 1;
            const variable = variablesById.get(token.value);
            if (!variable) {
                return {
                    valid: false,
                    error: "Unknown variable",
                };
            }

            const type = variableType(variable);
            if (type === UNKNOWN_TYPE) {
                return {
                    valid: false,
                    error: "Wrong type",
                };
            }

            return { valid: true, type };
        }

        if (token.kind === "literal") {
            position += 1;
            return { valid: true, type: token.valueType };
        }

        return {
            valid: false,
            error: "Invalid value",
        };
    };

    const parseMultiplicative = () => {
        let left = parsePrimary();
        if (!left.valid) return left;

        while (
            tokens[position]?.kind === "operator" &&
            ["*", "/"].includes(tokens[position].value)
            ) {
            const operator = tokens[position].value;
            position += 1;
            const right = parsePrimary();
            if (!right.valid) return right;
            left = applyOperator(operator, left.type, right.type);
            if (!left.valid) return left;
        }

        return left;
    };

    const parseAdditive = () => {
        let left = parseMultiplicative();
        if (!left.valid) return left;

        while (
            tokens[position]?.kind === "operator" &&
            ["+", "-"].includes(tokens[position].value)
            ) {
            const operator = tokens[position].value;
            position += 1;
            const right = parseMultiplicative();
            if (!right.valid) return right;
            left = applyOperator(operator, left.type, right.type);
            if (!left.valid) return left;
        }

        return left;
    };

    const parseComparison = () => {
        let left = parseAdditive();
        if (!left.valid) return left;

        while (
            tokens[position]?.kind === "operator" &&
            ["==", "!=", ">", "<", ">=", "<="].includes(tokens[position].value)
            ) {
            const operator = tokens[position].value;
            position += 1;
            const right = parseAdditive();
            if (!right.valid) return right;
            left = applyOperator(operator, left.type, right.type);
            if (!left.valid) return left;
        }

        return left;
    };

    const result = parseComparison();
    if (!result.valid) return result;

    if (position !== tokens.length) {
        return {
            valid: false,
            error: "Invalid value",
        };
    }

    return result;
}

export function validateAssignmentExpression(
    expression,
    targetVariable,
    variables = [],
    { allowEmpty = false } = {}
) {
    const value = String(expression || "").trim();

    if (!value) {
        return allowEmpty
            ? { valid: true, value: "", resultType: null }
            : { valid: false, error: "Value required" };
    }

    if (!targetVariable) {
        return {
            valid: false,
            error: "Select variable",
        };
    }

    const targetType = variableType(targetVariable);
    if (targetType === UNKNOWN_TYPE) {
        return {
            valid: false,
            error: "Wrong type",
        };
    }

    const inferred = inferExpressionType(value, variables);
    if (!inferred.valid) return inferred;

    if (!isValueTypeCompatible(inferred.type, targetType)) {
        return {
            valid: false,
            error: "Wrong type",
        };
    }

    return {
        valid: true,
        value,
        resultType: inferred.type,
    };
}
