import { isTauri, parseRuntimeLogText } from "../tauri-client.js";
import { parseSkillStateMachineLog } from "./runtimeLog";

/**
 * Parse a runtime log through the Rust backend in desktop mode while keeping
 * the historical JavaScript parser as browser/error fallback during the
 * migration. The DTO returned by Rust matches parseSkillStateMachineLog().
 */
export const parseRuntimeLogForReplay = async (text = "") => {
    if (!isTauri()) {
        return parseSkillStateMachineLog(text);
    }

    try {
        return await parseRuntimeLogText(text);
    } catch (error) {
        console.error(
            "Rust runtime-log parsing failed; falling back to JavaScript parser.",
            error
        );
        return parseSkillStateMachineLog(text);
    }
};
