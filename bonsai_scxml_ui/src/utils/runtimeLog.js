const backendOnly = () => {
    throw new Error(
        "Runtime replay semantics require the Rust/Tauri backend. Browser mode is UI-only."
    );
};

export const parseSkillStateMachineLog = backendOnly;
export const resolveRuntimeTraceAcrossTabs = backendOnly;
export const resolveRuntimeSlotTimelineAcrossTabs = backendOnly;
export const resolveRuntimeParameterTimelineAcrossTabs = backendOnly;
export const prepareRuntimeReplayCache = backendOnly;
