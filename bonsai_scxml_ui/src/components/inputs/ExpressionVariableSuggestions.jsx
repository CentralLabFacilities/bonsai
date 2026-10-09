import { getVariableType } from "../../utils/valueTypes.js";

function ExpressionVariableSuggestions({ variables, activeIndex, onSelect, showTypes = false }) {
    return (
        <div className="typed-value-autocomplete" role="listbox">
            {variables.map((variable, index) => {
                const type = showTypes ? getVariableType(variable) : null;

                return (
                    <button
                        type="button"
                        className={`typed-value-autocomplete-option ${
                            index === activeIndex ? "active" : ""
                        }`}
                        key={variable.id}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            onSelect(variable);
                        }}
                    >
                        <span className="typed-value-autocomplete-value">
                            @{variable.id}
                        </span>
                        {type && (
                            <span className={`datamodel-value-type-badge datamodel-value-type-${type.toLowerCase()}`}>
                                {type}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default ExpressionVariableSuggestions;
