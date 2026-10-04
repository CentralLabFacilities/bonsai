import { useState } from "react";
import { FiSend, FiX } from "react-icons/fi";

const NOP_SEND_EVENT_SUGGESTIONS = ["success", "fatal", "error"];

function NopSendEditor({ nodeId, events = [], onChange }) {
    const eventName = String(
        Array.isArray(events) && events.length > 0 ? events[0] ?? "" : ""
    );
    const [isFocused, setIsFocused] = useState(false);

    const normalizedQuery = eventName.trim().toLowerCase();
    const matchingSuggestions = NOP_SEND_EVENT_SUGGESTIONS.filter((suggestion) =>
        !normalizedQuery || suggestion.includes(normalizedQuery)
    );

    const setEventName = (value) => {
        const nextValue = String(value ?? "");
        onChange?.(nextValue ? [nextValue] : []);
    };

    const handleKeyDown = (event) => {
        if (event.key !== "Enter") return;

        const exactMatch = NOP_SEND_EVENT_SUGGESTIONS.find(
            (suggestion) => suggestion === normalizedQuery
        );
        const onlyMatch = matchingSuggestions.length === 1
            ? matchingSuggestions[0]
            : null;
        const match = exactMatch || onlyMatch;

        if (match && match !== eventName) {
            event.preventDefault();
            setEventName(match);
        }
    };

    return (
        <div className="nop-send-panel">
            <div className="nop-send-hero">
                <div className="nop-send-icon" aria-hidden="true">
                    <FiSend />
                </div>
                <div>
                    <div className="nop-send-eyebrow">Nop action</div>
                    <h3>Send event</h3>
                    <p>
                        A Nop can emit one event when it is reached. Use a standard
                        exit event or enter a custom event name.
                    </p>
                </div>
            </div>

            <div className="nop-send-card">
                <div className="nop-send-card-header">
                    <div>
                        <div className="nop-send-card-title">Outgoing event</div>
                        <div className="nop-send-card-subtitle">
                            Event sent to the parent state machine
                        </div>
                    </div>
                    <div className={`nop-send-status ${eventName.trim() ? "configured" : "empty"}`}>
                        {eventName.trim() ? "Configured" : "Not configured"}
                    </div>
                </div>

                <label className="nop-send-field-label" htmlFor={`nop-send-event-${nodeId}`}>
                    Event
                </label>

                <div className="nop-send-input-wrap">
                    <input
                        id={`nop-send-event-${nodeId}`}
                        className="nop-send-input"
                        type="text"
                        autoComplete="off"
                        spellCheck="false"
                        value={eventName}
                        placeholder="e.g. success or my.custom.event"
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => {
                            window.setTimeout(() => setIsFocused(false), 100);
                        }}
                        onChange={(event) => setEventName(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    {eventName && (
                        <button
                            type="button"
                            className="nop-send-clear"
                            title="Clear event"
                            aria-label="Clear event"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setEventName("")}
                        >
                            <FiX />
                        </button>
                    )}

                    {isFocused && matchingSuggestions.length > 0 && (
                        <div className="nop-send-suggestions">
                            {matchingSuggestions.map((suggestion) => (
                                <button
                                    type="button"
                                    key={suggestion}
                                    className={`nop-send-suggestion ${
                                        suggestion === normalizedQuery ? "selected" : ""
                                    }`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                        setEventName(suggestion);
                                        setIsFocused(false);
                                    }}
                                >
                                    <span>{suggestion}</span>
                                    <span className="nop-send-suggestion-kind">standard</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="nop-send-presets">
                    <span>Common events</span>
                    <div className="nop-send-preset-list">
                        {NOP_SEND_EVENT_SUGGESTIONS.map((suggestion) => (
                            <button
                                type="button"
                                key={suggestion}
                                className={`nop-send-preset ${
                                    suggestion === normalizedQuery ? "active" : ""
                                }`}
                                onClick={() => setEventName(suggestion)}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}


export default NopSendEditor;
