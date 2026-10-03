import { useRef } from "react";
import {
    FiFolder,
    FiPause,
    FiPlay,
    FiRotateCcw,
    FiSkipBack,
    FiSkipForward,
    FiX,
} from "react-icons/fi";

export default function RuntimeLogPlayer({
    runtimePlayback,
    onLoadRuntimeLog,
    onRuntimePlayPause,
    onRuntimeRestart,
    onRuntimePrevious,
    onRuntimeNext,
    onRuntimeSeek,
    onRuntimeClear,
    onRuntimeDelayChange,
}) {
    const runtimeLogInputRef = useRef(null);

    return (
        <>
            <input
                ref={runtimeLogInputRef}
                type="file"
                accept=".log,.txt,text/plain"
                style={{ display: "none" }}
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;

                    try {
                        const text = await file.text();
                        onLoadRuntimeLog?.(text, file.name);
                    } catch (error) {
                        console.error("Could not read runtime log:", error);
                    }
                }}
            />

            {!runtimePlayback?.loaded ? (
                <button
                    type="button"
                    className="runtime-log-load-button"
                    onClick={() => runtimeLogInputRef.current?.click()}
                    title="Load a SkillStateMachine runtime log"
                >
                    <FiFolder />
                    <span>Load log</span>
                </button>
            ) : (
                <div className="runtime-log-player" role="region" aria-label="Runtime log playback">
                    <div className="runtime-log-player-header">
                        <button
                            type="button"
                            className="runtime-log-file-button"
                            onClick={() => runtimeLogInputRef.current?.click()}
                            title="Load another runtime log"
                        >
                            <FiFolder />
                        </button>
                        <div className="runtime-log-file-info">
                            <strong title={runtimePlayback.fileName}>
                                {runtimePlayback.fileName || "Runtime log"}
                            </strong>
                            <span>
                                {runtimePlayback.stepCount > 0
                                    ? runtimePlayback.started
                                        ? `${runtimePlayback.stepIndex + 1} / ${runtimePlayback.stepCount}`
                                        : `Trace overview \u00b7 ${runtimePlayback.stepCount} transitions`
                                    : "No transitions found"}
                                {runtimePlayback.unresolvedCount > 0
                                    ? ` \u00b7 ${runtimePlayback.unresolvedCount} unmatched`
                                    : ""}
                                {runtimePlayback.unresolvedSlotSampleCount > 0
                                    ? ` \u00b7 ${runtimePlayback.unresolvedSlotSampleCount} slot values unmatched`
                                    : ""}
                                {runtimePlayback.unresolvedParameterSampleCount > 0
                                    ? ` \u00b7 ${runtimePlayback.unresolvedParameterSampleCount} parameter values unmatched`
                                    : ""}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="runtime-log-close-button"
                            onClick={onRuntimeClear}
                            title="Close runtime log"
                        >
                            <FiX />
                        </button>
                    </div>

                    {!runtimePlayback.started && runtimePlayback.stepCount > 0 && (
                        <div className="runtime-log-trace-overview">
                            {"Executed route highlighted \u00b7 press Play to follow it step by step"}
                        </div>
                    )}

                    {runtimePlayback.currentStep && (
                        <div className="runtime-log-current-step">
                            <div className="runtime-log-route" title={`${runtimePlayback.currentStep.source} \u2192 ${runtimePlayback.currentStep.target}`}>
                                <span>{runtimePlayback.currentStep.source}</span>
                                <span className="runtime-log-route-arrow">{"\u2192"}</span>
                                <span>{runtimePlayback.currentStep.target}</span>
                            </div>
                            <div className="runtime-log-event-row">
                                <code>{runtimePlayback.currentStep.event || "(no event)"}</code>
                                <span>{runtimePlayback.currentStep.timestamp}</span>
                                {!runtimePlayback.currentStep.resolved && (
                                    <span className="runtime-log-unmatched">not matched</span>
                                )}
                            </div>
                        </div>
                    )}

                    {runtimePlayback.stepCount > 0 && (
                        <div className="runtime-log-timeline">
                            <div className="runtime-log-timeline-labels">
                                <span>
                                    {runtimePlayback.started
                                        ? `Step ${runtimePlayback.stepIndex + 1}`
                                        : "Trace start"}
                                </span>
                                <span>
                                    {runtimePlayback.started
                                        ? runtimePlayback.currentStep?.timestamp || ""
                                        : "Click to jump"}
                                </span>
                                <span>{runtimePlayback.stepCount}</span>
                            </div>
                            <input
                                className="runtime-log-timeline-range"
                                type="range"
                                min={0}
                                max={Math.max(0, runtimePlayback.stepCount - 1)}
                                step={1}
                                value={runtimePlayback.started ? runtimePlayback.stepIndex : 0}
                                onChange={(event) =>
                                    onRuntimeSeek?.(Number(event.target.value))
                                }
                                aria-label="Runtime transition timeline"
                                title="Click or drag to jump to a transition"
                            />
                        </div>
                    )}

                    <div className="runtime-log-controls">
                        <button
                            type="button"
                            onClick={onRuntimeRestart}
                            disabled={runtimePlayback.stepCount === 0}
                            title="Start from beginning"
                        >
                            <FiRotateCcw />
                        </button>
                        <button
                            type="button"
                            onClick={onRuntimePrevious}
                            disabled={
                                runtimePlayback.stepCount === 0 ||
                                !runtimePlayback.started ||
                                runtimePlayback.stepIndex <= 0
                            }
                            title="Previous transition"
                        >
                            <FiSkipBack />
                        </button>
                        <button
                            type="button"
                            className="runtime-log-play-button"
                            onClick={onRuntimePlayPause}
                            disabled={runtimePlayback.stepCount === 0}
                            title={runtimePlayback.isPlaying ? "Pause" : "Play"}
                        >
                            {runtimePlayback.isPlaying ? <FiPause /> : <FiPlay />}
                        </button>
                        <button
                            type="button"
                            onClick={onRuntimeNext}
                            disabled={
                                runtimePlayback.stepCount === 0 ||
                                !runtimePlayback.started ||
                                runtimePlayback.stepIndex >= runtimePlayback.stepCount - 1
                            }
                            title="Next transition"
                        >
                            <FiSkipForward />
                        </button>
                        <select
                            value={runtimePlayback.delay}
                            onChange={(event) =>
                                onRuntimeDelayChange?.(Number(event.target.value))
                            }
                            title="Playback speed"
                            aria-label="Playback speed"
                        >
                            <option value={1400}>{"0.5\u00d7"}</option>
                            <option value={800}>{"1\u00d7"}</option>
                            <option value={400}>{"2\u00d7"}</option>
                            <option value={200}>{"4\u00d7"}</option>
                        </select>
                    </div>
                </div>
            )}
        </>
    );
}
