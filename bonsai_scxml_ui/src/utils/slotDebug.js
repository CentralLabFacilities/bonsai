const SLOT_DEBUG_FLAG = "BONSAI_SLOT_DEBUG";
const SLOT_DEBUG_BUFFER = "__BONSAI_SLOT_DEBUG_BUFFER__";
const SLOT_DEBUG_SEQUENCE = "__BONSAI_SLOT_DEBUG_SEQUENCE__";
const SLOT_DEBUG_MAX_ENTRIES = 300;

const getWindow = () =>
    typeof window !== "undefined" ? window : null;

export const isSlotDebugEnabled = () => {
    const target = getWindow();
    return Boolean(target?.[SLOT_DEBUG_FLAG]);
};

const sanitize = (value, depth = 0) => {
    if (depth > 5) return "[depth-limit]";
    if (value === null || value === undefined) return value;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) {
        return value.slice(0, 80).map((entry) => sanitize(entry, depth + 1));
    }
    if (typeof value === "object") {
        const next = {};
        Object.entries(value).slice(0, 80).forEach(([key, entry]) => {
            next[key] = sanitize(entry, depth + 1);
        });
        return next;
    }
    return String(value);
};

const installDebugHelpers = (target) => {
    if (!target || target.BONSAI_SLOT_DEBUG_DUMP) return;

    target.BONSAI_SLOT_DEBUG_DUMP = () => {
        const entries = Array.isArray(target[SLOT_DEBUG_BUFFER])
            ? target[SLOT_DEBUG_BUFFER]
            : [];
        return JSON.stringify(entries, null, 2);
    };
    target.BONSAI_SLOT_DEBUG_CLEAR = () => {
        target[SLOT_DEBUG_BUFFER] = [];
        target[SLOT_DEBUG_SEQUENCE] = 0;
        console.info("[Bonsai Slot Debug] trace cleared");
    };
};

export const slotDebug = (event, details = {}) => {
    const target = getWindow();
    if (!target || !target[SLOT_DEBUG_FLAG]) return;

    installDebugHelpers(target);
    const sequence = Number(target[SLOT_DEBUG_SEQUENCE] || 0) + 1;
    target[SLOT_DEBUG_SEQUENCE] = sequence;

    const entry = {
        sequence,
        time: new Date().toISOString(),
        event: String(event || "unknown"),
        details: sanitize(details),
    };

    const buffer = Array.isArray(target[SLOT_DEBUG_BUFFER])
        ? target[SLOT_DEBUG_BUFFER]
        : [];
    buffer.push(entry);
    if (buffer.length > SLOT_DEBUG_MAX_ENTRIES) {
        buffer.splice(0, buffer.length - SLOT_DEBUG_MAX_ENTRIES);
    }
    target[SLOT_DEBUG_BUFFER] = buffer;

    console.debug(`[Bonsai Slot Debug #${sequence}] ${entry.event}`, entry.details);
};

export const summarizeSkillSlots = (nodes = [], stateId = null) => {
    const source = Array.isArray(nodes) ? nodes : [];
    const candidates = stateId
        ? source.filter((node) => String(node?.id || "") === String(stateId))
        : source.filter(
              (node) =>
                  Array.isArray(node?.data?.inSlots) ||
                  Array.isArray(node?.data?.outSlots)
          );

    return candidates.map((node) => ({
        stateId: String(node?.id || ""),
        label: String(
            node?.data?.label || node?.data?.fullSkillName || node?.id || ""
        ),
        inputSlots: (node?.data?.inSlots || []).map((slot, index) => ({
            index,
            key: String(slot?.key || slot?.name || ""),
            path: String(slot?.path || ""),
            type: String(slot?.type || ""),
        })),
        outputSlots: (node?.data?.outSlots || []).map((slot, index) => ({
            index,
            key: String(slot?.key || slot?.name || ""),
            path: String(slot?.path || ""),
            type: String(slot?.type || ""),
        })),
    }));
};

export const summarizeRustSlotSnapshot = (snapshot = {}) => ({
    states: (snapshot?.states || []).map((state) => ({
        stateId: String(state?.stateId || ""),
        stateName: String(state?.stateName || ""),
        inputSlots: (state?.inputSlots || []).map((slot, index) => ({
            index,
            key: String(slot?.key || slot?.name || ""),
            path: String(slot?.path || slot?.xpath || ""),
        })),
        outputSlots: (state?.outputSlots || []).map((slot, index) => ({
            index,
            key: String(slot?.key || slot?.name || ""),
            path: String(slot?.path || slot?.xpath || ""),
        })),
    })),
    extraSlotDeclarations: (snapshot?.extraSlotDeclarations || []).map((slot) => ({
        key: String(slot?.key || ""),
        state: String(slot?.state || ""),
        xpath: String(slot?.xpath || ""),
        inherited: Boolean(slot?.inherited),
    })),
});

export const summarizeProblems = (problems = []) =>
    (Array.isArray(problems) ? problems : []).map((problem) => ({
        id: String(problem?.id || ""),
        severity: String(problem?.severity || ""),
        category: String(problem?.category || ""),
        title: String(problem?.title || ""),
        message: String(problem?.message || ""),
        nodeId: String(
            problem?.nodeId ||
                problem?.stateId ||
                problem?.sourceNodeId ||
                ""
        ),
    }));
