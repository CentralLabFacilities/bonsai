export const VALUE_TYPES = Object.freeze({
    INTEGER: "Integer",
    DOUBLE: "Double",
    BOOLEAN: "Boolean",
    STRING: "String",
});

const INTEGER_PATTERN = /^[+-]?\d+$/;
const DOUBLE_PATTERN = /^[+-]?(?:(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)$/;

export function normalizeValueType(type) {
    const normalized = String(type || "").trim().toLowerCase();

    if (["integer", "int", "long", "short"].includes(normalized)) {
        return VALUE_TYPES.INTEGER;
    }

    if (["double", "float", "number", "decimal"].includes(normalized)) {
        return VALUE_TYPES.DOUBLE;
    }

    if (["boolean", "bool"].includes(normalized)) {
        return VALUE_TYPES.BOOLEAN;
    }

    if (["string", "text", "char", "character"].includes(normalized)) {
        return VALUE_TYPES.STRING;
    }

    return null;
}

export function inferLiteralValueType(value) {
    const trimmed = String(value ?? "").trim();

    if (/^(true|false)$/i.test(trimmed)) {
        return VALUE_TYPES.BOOLEAN;
    }

    if (INTEGER_PATTERN.test(trimmed)) {
        return VALUE_TYPES.INTEGER;
    }

    if (DOUBLE_PATTERN.test(trimmed)) {
        return VALUE_TYPES.DOUBLE;
    }

    return VALUE_TYPES.STRING;
}

function quoteStringValue(value) {
    let text = String(value ?? "").trim();

    if (
        (text.startsWith("'") && text.endsWith("'") && text.length >= 2) ||
        (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
    ) {
        text = text.slice(1, -1);
    }

    const escaped = text
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");

    return `'${escaped}'`;
}

export function normalizeDatamodelValue(value) {
    const trimmed = String(value ?? "").trim();
    const type = inferLiteralValueType(trimmed);

    if (type === VALUE_TYPES.STRING) {
        return quoteStringValue(trimmed);
    }

    if (type === VALUE_TYPES.BOOLEAN) {
        return trimmed.toLowerCase();
    }

    return trimmed;
}

export function getVariableType(variable) {
    if (!variable) return null;

    const declaredType = normalizeValueType(
        variable.valueType || variable.type
    );

    if (declaredType) return declaredType;

    return inferLiteralValueType(variable.expr ?? variable.value ?? "");
}

export function getReferenceName(value) {
    const trimmed = String(value ?? "").trim();

    if (!trimmed.startsWith("@") || trimmed.length < 2) {
        return null;
    }

    const name = trimmed.slice(1);

    if (/\s/.test(name)) {
        return null;
    }

    return name;
}

export function isValueTypeCompatible(valueType, expectedType) {
    const normalizedValueType = normalizeValueType(valueType) || valueType || null;
    const normalizedExpectedType = normalizeValueType(expectedType) || expectedType || null;

    if (!normalizedExpectedType) return true;
    if (!normalizedValueType) return false;
    if (normalizedValueType === normalizedExpectedType) return true;

    // Integer values can be assigned to Double targets, but not vice versa.
    return (
        normalizedExpectedType === VALUE_TYPES.DOUBLE &&
        normalizedValueType === VALUE_TYPES.INTEGER
    );
}

export function getCompatibleVariables(variables, expectedType, excludeId = null) {
    const normalizedExpectedType = normalizeValueType(expectedType) || expectedType || null;

    return (Array.isArray(variables) ? variables : [])
        .filter((variable) => variable?.id && variable.id !== excludeId)
        .filter((variable) => {
            if (!normalizedExpectedType) return true;
            return isValueTypeCompatible(
                getVariableType(variable),
                normalizedExpectedType
            );
        });
}

export function normalizeTypedValue(
    value,
    expectedType,
    variables = [],
    { allowEmpty = true } = {}
) {
    const trimmed = String(value ?? "").trim();
    const normalizedExpectedType = normalizeValueType(expectedType) || expectedType || null;

    if (!trimmed) {
        if (allowEmpty) {
            return { valid: true, value: "", type: normalizedExpectedType };
        }

        return {
            valid: false,
            value: trimmed,
            type: normalizedExpectedType,
            error: "A value is required.",
        };
    }

    const referenceName = getReferenceName(trimmed);

    if (referenceName) {
        const referencedVariable = (Array.isArray(variables) ? variables : []).find(
            (variable) => variable?.id === referenceName
        );

        if (!referencedVariable) {
            return {
                valid: false,
                value: trimmed,
                type: normalizedExpectedType,
                error: `Unknown parameter “${referenceName}”.`,
            };
        }

        const referencedType = getVariableType(referencedVariable);

        if (
            normalizedExpectedType &&
            !isValueTypeCompatible(referencedType, normalizedExpectedType)
        ) {
            return {
                valid: false,
                value: trimmed,
                type: normalizedExpectedType,
                error: `${referenceName} is ${referencedType}, but ${normalizedExpectedType} is required.`,
            };
        }

        return {
            valid: true,
            value: `@${referenceName}`,
            type: referencedType,
        };
    }

    const literalType = inferLiteralValueType(trimmed);

    if (
        normalizedExpectedType &&
        !isValueTypeCompatible(literalType, normalizedExpectedType)
    ) {
        const acceptedTypes =
            normalizedExpectedType === VALUE_TYPES.DOUBLE
                ? "Double or Integer"
                : normalizedExpectedType;

        return {
            valid: false,
            value: trimmed,
            type: normalizedExpectedType,
            error: `${normalizedExpectedType} requires a ${acceptedTypes} literal or parameter.`,
        };
    }

    const effectiveType = normalizedExpectedType || literalType;

    if (effectiveType === VALUE_TYPES.STRING) {
        return {
            valid: true,
            value: quoteStringValue(trimmed),
            type: VALUE_TYPES.STRING,
        };
    }

    if (effectiveType === VALUE_TYPES.BOOLEAN) {
        return {
            valid: true,
            value: trimmed.toLowerCase(),
            type: VALUE_TYPES.BOOLEAN,
        };
    }

    return {
        valid: true,
        value: trimmed,
        type: effectiveType,
    };
}

export function serializeEditorValueForScxml(
    value,
    { preserveReferenceMarker = false } = {}
) {
    const trimmed = String(value ?? "").trim();

    if (!trimmed) return "";

    const referenceName = getReferenceName(trimmed);
    if (referenceName) {
        return preserveReferenceMarker ? `@${referenceName}` : referenceName;
    }

    const literalType = inferLiteralValueType(trimmed);

    if (literalType === VALUE_TYPES.BOOLEAN) {
        return trimmed.toLowerCase();
    }

    if (
        literalType === VALUE_TYPES.INTEGER ||
        literalType === VALUE_TYPES.DOUBLE
    ) {
        return trimmed;
    }

    // A value without the editor-only @ marker is a literal string.
    return quoteStringValue(trimmed);
}

export function deserializeScxmlValueForEditor(value) {
    const trimmed = String(value ?? "").trim();

    if (!trimmed) return "";
    if (getReferenceName(trimmed)) return trimmed;

    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
    ) {
        return quoteStringValue(trimmed);
    }

    const literalType = inferLiteralValueType(trimmed);
    if (
        literalType === VALUE_TYPES.INTEGER ||
        literalType === VALUE_TYPES.DOUBLE ||
        literalType === VALUE_TYPES.BOOLEAN
    ) {
        return literalType === VALUE_TYPES.BOOLEAN
            ? trimmed.toLowerCase()
            : trimmed;
    }

    // Outside a state's skill-parameter datamodel, a bare SCXML identifier
    // represents a variable reference. The UI adds @ purely as a visual marker.
    if (/^[A-Za-z_#][A-Za-z0-9_:#.\-]*$/.test(trimmed)) {
        return `@${trimmed}`;
    }

    return trimmed;
}

export function deserializeStateDatamodelValueForEditor(value) {
    const trimmed = String(value ?? "").trim();

    if (!trimmed) return "";
    if (getReferenceName(trimmed)) return trimmed;

    const literalType = inferLiteralValueType(trimmed);
    if (literalType === VALUE_TYPES.STRING) {
        // The state datamodel is the one SCXML context where @ is retained for
        // variable references. Without @, textual input is therefore a string.
        return quoteStringValue(trimmed);
    }

    return literalType === VALUE_TYPES.BOOLEAN
        ? trimmed.toLowerCase()
        : trimmed;
}

export function serializeEditorConditionForScxml(condition) {
    const trimmed = String(condition ?? "").trim();
    if (!trimmed) return "";

    const match = trimmed.match(/^(@?[^\s]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!match) {
        // Best effort for legacy/free-form conditions: remove only explicit
        // editor reference markers instead of quoting the whole expression.
        return trimmed.replace(/@([A-Za-z_#][A-Za-z0-9_:#.\-]*)/g, "$1");
    }

    const [, rawLeft, operator, rawRight] = match;
    const left = rawLeft.startsWith("@") ? rawLeft.slice(1) : rawLeft;
    const right = serializeEditorValueForScxml(rawRight);

    return `${left} ${operator} ${right}`;
}

export function deserializeScxmlConditionForEditor(condition) {
    const trimmed = String(condition ?? "").trim();
    if (!trimmed) return "";

    const match = trimmed.match(/^([^\s]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!match) return trimmed;

    const [, left, operator, rawRight] = match;
    const right = deserializeScxmlValueForEditor(rawRight);

    return `${left} ${operator} ${right}`;
}

