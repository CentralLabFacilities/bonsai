import { useEffect, useMemo, useRef, useState } from "react";
import {
    VALUE_TYPES,
    getCompatibleVariables,
    getVariableType,
    normalizeTypedValue,
    normalizeValueType,
} from "../utils/valueTypes";

function TypedValueEditor({
                              value,
                              expectedType,
                              variables = [],
                              onCommit,
                              onDraftChange,
                              placeholder = "Enter value",
                              inputClassName = "slot-field-edit",
                              disabled = false,
                              allowEmpty = true,
                              excludeVariableId = null,
                          }) {
    const [draft, setDraft] = useState(value ?? "");
    const [error, setError] = useState("");
    const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const inputRef = useRef(null);

    useEffect(() => {
        setDraft(value ?? "");
        setError("");
        setIsAutocompleteOpen(false);
        setActiveSuggestionIndex(-1);
    }, [value, expectedType]);

    const normalizedType = normalizeValueType(expectedType) || expectedType || null;

    const compatibleVariables = useMemo(
        () => getCompatibleVariables(variables, normalizedType, excludeVariableId),
        [variables, normalizedType, excludeVariableId]
    );

    const suggestions = useMemo(() => {
        const items = [];

        if (normalizedType === VALUE_TYPES.BOOLEAN) {
            items.push(
                { value: "true", label: "true", kind: "Boolean" },
                { value: "false", label: "false", kind: "Boolean" }
            );
        }

        compatibleVariables.forEach((variable) => {
            items.push({
                value: `@${variable.id}`,
                label: variable.id,
                kind: getVariableType(variable) || "Parameter",
            });
        });

        return items;
    }, [compatibleVariables, normalizedType]);

    const matchingSuggestions = useMemo(() => {
        const query = String(draft || "").trim().toLowerCase();

        if (!query) return [];

        const normalizedQuery = query.startsWith("@")
            ? query.slice(1)
            : query;

        return suggestions
            .filter((suggestion) => {
                const value = suggestion.value.toLowerCase();
                const label = suggestion.label.toLowerCase();

                if (suggestion.value.startsWith("@")) {
                    return (
                        label.includes(normalizedQuery) ||
                        value.includes(query)
                    );
                }

                return value.includes(query);
            })
            .sort((a, b) => {
                const aLabel = a.label.toLowerCase();
                const bLabel = b.label.toLowerCase();
                const aStarts = aLabel.startsWith(normalizedQuery) ? 0 : 1;
                const bStarts = bLabel.startsWith(normalizedQuery) ? 0 : 1;
                return aStarts - bStarts || aLabel.localeCompare(bLabel);
            })
            .slice(0, 8);
    }, [draft, suggestions]);

    useEffect(() => {
        if (activeSuggestionIndex >= matchingSuggestions.length) {
            setActiveSuggestionIndex(matchingSuggestions.length > 0 ? 0 : -1);
        }
    }, [matchingSuggestions, activeSuggestionIndex]);

    const commitValue = (nextValue = draft) => {
        const result = normalizeTypedValue(
            nextValue,
            normalizedType,
            variables,
            { allowEmpty }
        );

        if (!result.valid) {
            setError(result.error || "Invalid value.");
            return false;
        }

        setDraft(result.value);
        setError("");
        setIsAutocompleteOpen(false);
        setActiveSuggestionIndex(-1);
        onDraftChange?.(result.value);
        onCommit?.(result.value);
        return true;
    };

    const selectSuggestion = (suggestion) => {
        if (!suggestion) return;

        setDraft(suggestion.value);
        setError("");
        setIsAutocompleteOpen(false);
        setActiveSuggestionIndex(-1);
        onDraftChange?.(suggestion.value);
        onCommit?.(suggestion.value);

        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };

    const handleKeyDown = (event) => {
        if (
            isAutocompleteOpen &&
            matchingSuggestions.length > 0 &&
            event.key === "ArrowDown"
        ) {
            event.preventDefault();
            setActiveSuggestionIndex((current) =>
                current < matchingSuggestions.length - 1 ? current + 1 : 0
            );
            return;
        }

        if (
            isAutocompleteOpen &&
            matchingSuggestions.length > 0 &&
            event.key === "ArrowUp"
        ) {
            event.preventDefault();
            setActiveSuggestionIndex((current) =>
                current > 0 ? current - 1 : matchingSuggestions.length - 1
            );
            return;
        }

        if (event.key === "Escape") {
            setIsAutocompleteOpen(false);
            setActiveSuggestionIndex(-1);
            return;
        }

        if (event.key !== "Enter") return;

        event.preventDefault();

        if (
            isAutocompleteOpen &&
            matchingSuggestions.length > 0 &&
            activeSuggestionIndex >= 0
        ) {
            selectSuggestion(matchingSuggestions[activeSuggestionIndex]);
            return;
        }

        if (commitValue()) {
            event.currentTarget.blur();
        }
    };

    return (
        <div className={`typed-value-editor ${error ? "typed-value-editor-invalid" : ""}`}>
            <div className="typed-value-editor-row">
                <input
                    ref={inputRef}
                    className={inputClassName}
                    type="text"
                    value={draft}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    autoComplete="off"
                    onFocus={() => {
                        if (String(draft || "").trim() && matchingSuggestions.length > 0) {
                            setIsAutocompleteOpen(true);
                            setActiveSuggestionIndex(0);
                        }
                    }}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setDraft(nextValue);
                        setError("");
                        onDraftChange?.(nextValue);

                        const hasText = nextValue.trim().length > 0;
                        setIsAutocompleteOpen(hasText);
                        setActiveSuggestionIndex(hasText ? 0 : -1);
                    }}
                    onBlur={() => {
                        window.setTimeout(() => {
                            setIsAutocompleteOpen(false);
                            setActiveSuggestionIndex(-1);
                        }, 120);
                        commitValue();
                    }}
                    onKeyDown={handleKeyDown}
                />

                {isAutocompleteOpen && matchingSuggestions.length > 0 && (
                    <div className="typed-value-autocomplete" role="listbox">
                        {matchingSuggestions.map((suggestion, index) => (
                            <button
                                type="button"
                                className={`typed-value-autocomplete-option ${
                                    index === activeSuggestionIndex ? "active" : ""
                                }`}
                                key={`${suggestion.kind}:${suggestion.value}`}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectSuggestion(suggestion);
                                }}
                            >
                                <span className="typed-value-autocomplete-value">
                                    {suggestion.value}
                                </span>
                                <span className="typed-value-autocomplete-type">
                                    {suggestion.kind}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {error && <div className="typed-value-error">{error}</div>}
        </div>
    );
}

export default TypedValueEditor;
