import { isSlotEdge } from "./editorGraph";
import { getTransitionExitToken } from "./transitionEvents";

const normalizeName = (value) => String(value || "").trim();


const runtimeDataKeyForContext = (localKey, context) => {
    const key = normalizeName(localKey);
    const suffixParts = context?.suffixParts || [];
    if (!key || suffixParts.length === 0) return key;
    return `${key}_${suffixParts.join("_")}`;
};

const parseExpressionTokens = (expression = "") => {
    const source = String(expression ?? "");
    const tokens = [];
    let index = 0;

    const isIdentifierStart = (char) => /[A-Za-z_$]/.test(char || "");
    const isIdentifierPart = (char) => /[A-Za-z0-9_$]/.test(char || "");

    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        if (char === "'" || char === '"') {
            const quote = char;
            index += 1;
            let value = "";
            let closed = false;
            while (index < source.length) {
                const next = source[index++];
                if (next === "\\") {
                    if (index >= source.length) break;
                    const escaped = source[index++];
                    const escapes = {
                        n: "\n",
                        r: "\r",
                        t: "\t",
                        "\\": "\\",
                        "'": "'",
                        '"': '"',
                    };
                    value += Object.prototype.hasOwnProperty.call(escapes, escaped)
                        ? escapes[escaped]
                        : escaped;
                    continue;
                }
                if (next === quote) {
                    closed = true;
                    break;
                }
                value += next;
            }
            if (!closed) throw new Error("Unterminated string literal");
            tokens.push({ type: "literal", value });
            continue;
        }

        const numberMatch = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
        if (numberMatch) {
            tokens.push({ type: "literal", value: Number(numberMatch[0]) });
            index += numberMatch[0].length;
            continue;
        }

        let identifierPrefix = "";
        if (char === "@" && isIdentifierStart(source[index + 1])) {
            identifierPrefix = "@";
            index += 1;
        }
        if (isIdentifierStart(source[index])) {
            let value = identifierPrefix;
            while (index < source.length && isIdentifierPart(source[index])) {
                value += source[index++];
            }
            if (value === "true") tokens.push({ type: "literal", value: true });
            else if (value === "false") tokens.push({ type: "literal", value: false });
            else if (value === "null") tokens.push({ type: "literal", value: null });
            else tokens.push({ type: "identifier", value });
            continue;
        }

        const operators = ["===", "!==", "<=", ">=", "==", "!=", "&&", "||"];
        const operator = operators.find((candidate) =>
            source.startsWith(candidate, index)
        );
        if (operator) {
            tokens.push({ type: "operator", value: operator });
            index += operator.length;
            continue;
        }

        if ("+-*/%<>()!".includes(char)) {
            tokens.push({
                type: char === "(" || char === ")" ? "paren" : "operator",
                value: char,
            });
            index += 1;
            continue;
        }

        throw new Error(`Unsupported token '${char}'`);
    }

    return tokens;
};

const evaluateRuntimeExpression = (expression, values, context = null) => {
    try {
        const tokens = parseExpressionTokens(expression);
        let position = 0;

        const peek = () => tokens[position] || null;
        const consume = (value = null) => {
            const token = tokens[position];
            if (!token || (value != null && token.value !== value)) {
                throw new Error(
                    value == null
                        ? "Unexpected end of expression"
                        : `Expected '${value}'`
                );
            }
            position += 1;
            return token;
        };

        const resolveIdentifier = (rawName) => {
            const localName = normalizeName(rawName).replace(/^@/, "");
            const scopedName = runtimeDataKeyForContext(localName, context);

            // Inside a Sub-SM, an unsuffixed expression identifier refers to
            // that Sub-SM's suffixed runtime datamodel value. Prefer it over a
            // same-named variable from an outer/root state machine.
            if (scopedName && scopedName !== localName && values.has(scopedName)) {
                return values.get(scopedName);
            }
            if (values.has(localName)) return values.get(localName);

            throw new Error(`Unknown variable '${localName}'`);
        };

        const parsePrimary = () => {
            const token = peek();
            if (!token) throw new Error("Expected a value");
            if (token.type === "literal") {
                position += 1;
                return token.value;
            }
            if (token.type === "identifier") {
                position += 1;
                return resolveIdentifier(token.value);
            }
            if (token.type === "paren" && token.value === "(") {
                consume("(");
                const value = parseOr();
                consume(")");
                return value;
            }
            throw new Error(`Unexpected token '${token.value}'`);
        };

        const parseUnary = () => {
            const token = peek();
            if (token?.type === "operator" && ["!", "+", "-"].includes(token.value)) {
                position += 1;
                const value = parseUnary();
                if (token.value === "!") return !value;
                if (token.value === "+") return +value;
                return -value;
            }
            return parsePrimary();
        };

        const binary = (nextParser, operators, operation) => () => {
            let left = nextParser();
            while (peek()?.type === "operator" && operators.includes(peek().value)) {
                const operator = consume().value;
                const right = nextParser();
                left = operation(operator, left, right);
            }
            return left;
        };

        const parseMultiplicative = binary(
            parseUnary,
            ["*", "/", "%"],
            (operator, left, right) => {
                if (operator === "*") return left * right;
                if (operator === "/") return left / right;
                return left % right;
            }
        );
        const parseAdditive = binary(
            parseMultiplicative,
            ["+", "-"],
            (operator, left, right) =>
                operator === "+" ? left + right : left - right
        );
        const parseRelational = binary(
            parseAdditive,
            ["<", "<=", ">", ">="],
            (operator, left, right) => {
                if (operator === "<") return left < right;
                if (operator === "<=") return left <= right;
                if (operator === ">") return left > right;
                return left >= right;
            }
        );
        const parseEquality = binary(
            parseRelational,
            ["==", "!=", "===", "!=="],
            (operator, left, right) => {
                if (operator === "==") return left === right;
                if (operator === "!=") return left !== right;
                if (operator === "===") return left === right;
                return left !== right;
            }
        );
        const parseAnd = binary(
            parseEquality,
            ["&&"],
            (_operator, left, right) => left && right
        );
        const parseOr = binary(
            parseAnd,
            ["||"],
            (_operator, left, right) => left || right
        );

        const value = parseOr();
        if (position !== tokens.length) {
            throw new Error(`Unexpected token '${tokens[position]?.value || ""}'`);
        }
        return { ok: true, value };
    } catch (error) {
        return {
            ok: false,
            value: undefined,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

export const parseSkillStateMachineLog = (text = "") => {
    const steps = [];
    const slotSamples = [];
    const parameterSamples = [];
    const dataSamples = [];
    let firstEntry = null;
    let currentEntryState = null;
    let currentInvocationState = null;
    let currentRunnerState = null;
    let requestedSlots = [];

    const requestedSlotKeyFor = (kind) => {
        const acceptedDirections =
            kind === "write" ? new Set(["OUT", "BI"]) : new Set(["IN", "BI"]);
        const matching = requestedSlots.filter((slot) =>
            acceptedDirections.has(slot.direction)
        );
        if (matching.length === 1) return matching[0].key;
        if (requestedSlots.length === 1) return requestedSlots[0].key;
        return "";
    };

    String(text || "")
        .split(/\r?\n/)
        .forEach((line, lineIndex) => {
            const lineNumber = lineIndex + 1;
            const entryMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillStateMachine:\s+OnEntry:\s+(.+?)\s*$/i
            );
            if (entryMatch) {
                currentEntryState = normalizeName(entryMatch[2]);
                if (!firstEntry) {
                    firstEntry = {
                        timestamp: entryMatch[1],
                        state: currentEntryState,
                        line: lineNumber,
                    };
                }
            }

            // Runtime parameter values are the resolved `#...` datamodel
            // entries written by SkillStateMachine, e.g.
            //   data id:#_WRITE with expr=@test_val changed to:0
            // Do not use the later `parameter #_WRITE='0'` line as the source
            // of truth; this line contains both the configured expression and
            // the concrete runtime value that was assigned.
            const dataChangeMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillStateMachine:\s+data id:(.+?)(?:\s+with expr=(.*?))?\s+changed to:(.*)\s*$/i
            );
            if (dataChangeMatch) {
                const key = normalizeName(dataChangeMatch[2]);
                if (key.startsWith("#")) {
                    parameterSamples.push({
                        timestamp: dataChangeMatch[1],
                        line: lineNumber,
                        state: normalizeName(currentEntryState),
                        key,
                        expr: normalizeName(dataChangeMatch[3]),
                        value: normalizeName(dataChangeMatch[4]),
                    });
                }
            }

            // Datamodel changes are logged by the actual SCXML <assign>
            // execution. VALUE OF is the assignment expression; the log line
            // does not necessarily contain the evaluated result.
            const assignmentMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillStateMachine:\s+ASSIGN\s+##\s+Name:(.+?)\s+VALUE OF:'(.*)'\s*$/i
            );
            if (assignmentMatch) {
                const key = normalizeName(assignmentMatch[2]);
                // Older logger versions printed the Java Assign object's
                // identity instead of the variable id. That cannot be mapped
                // to the editor and should not appear as a fake variable.
                if (key && !key.includes("@")) {
                    const expression = assignmentMatch[3];
                    dataSamples.push({
                        timestamp: assignmentMatch[1],
                        line: lineNumber,
                        state: normalizeName(currentEntryState),
                        key,
                        expr: expression,
                        value: expression,
                        kind: "assign",
                    });
                }
            }

            const invokeMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillStateMachine:\s+INVOKE\s+###\s+(.+?)\s*$/i
            );
            if (invokeMatch) {
                currentInvocationState = normalizeName(invokeMatch[2]);
                currentRunnerState = currentInvocationState;
                requestedSlots = [];
            }

            const runnerMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillRunner:\s+(.+?)\s+->\s+/i
            );
            if (runnerMatch) {
                currentRunnerState = normalizeName(runnerMatch[2]);
            }

            const requestedSlotMatch = line.match(
                /^\d{2}:\d{2}:\d{2}\s+\w+\s+SkillConfigurator:\s+Requested slot\s+"([^"]+)".*?dir:\s*([A-Z]+)\s*$/i
            );
            if (requestedSlotMatch) {
                requestedSlots.push({
                    key: normalizeName(requestedSlotMatch[1]),
                    direction: normalizeName(requestedSlotMatch[2]).toUpperCase(),
                });
            }

            // The slot implementation itself is authoritative for the value
            // observed on a slot. `recall` is a read/current-value observation;
            // `memorized` is a write/new-value observation.
            const objectSlotMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+ObjectSlot:\s+(recall|memorized)\s+object\s+of\s+type\s+.+?:\s*(.*)\s*$/i
            );
            if (objectSlotMatch) {
                const operation = objectSlotMatch[2].toLowerCase();
                const kind = operation === "memorized" ? "write" : "read";
                slotSamples.push({
                    timestamp: objectSlotMatch[1],
                    line: lineNumber,
                    state: normalizeName(currentRunnerState || currentInvocationState),
                    value: objectSlotMatch[3],
                    kind,
                    operation,
                    slotKey: requestedSlotKeyFor(kind),
                });
            }

            const transitionMatch = line.match(
                /^(\d{2}:\d{2}:\d{2})\s+\w+\s+SkillStateMachine:\s+onTransition:\s*"([^"]+)"\s*-->\s*"([^"]+)"\s*event:\s*"([^"]*)"/i
            );
            if (!transitionMatch) return;

            steps.push({
                timestamp: transitionMatch[1],
                source: normalizeName(transitionMatch[2]),
                target: normalizeName(transitionMatch[3]),
                event: normalizeName(transitionMatch[4]),
                line: lineNumber,
            });
        });

    return { steps, firstEntry, slotSamples, parameterSamples, dataSamples };
};

const nodeNames = (node) => {
    const rawValues = [
        node?.data?.fullSkillName,
        node?.data?.scxmlStateId,
        node?.data?.label,
        node?.id,
    ]
        .map(normalizeName)
        .filter(Boolean);

    // SkillRunner log lines often omit the package prefix (for example
    // `SlotIO#A` while the SCXML state is `slots.SlotIO#A`). Keep both forms
    // in the lookup so slot observations resolve to the same editor node.
    const values = new Set(rawValues);
    rawValues.forEach((value) => {
        const shortName = value.split(".").pop();
        if (shortName) values.add(shortName);
    });
    return values;
};

const getSemanticTargetId = (edge) =>
    edge?.data?.boundaryOriginalTarget ||
    edge?.data?.compoundOriginalTarget ||
    edge?.data?.parallelOriginalTarget ||
    edge?.target;

const getSemanticSourceEntries = (edge) => {
    const stored = Array.isArray(edge?.data?.boundaryOriginalSources)
        ? edge.data.boundaryOriginalSources
              .map((entry) => ({
                  sourceId: normalizeName(
                      entry?.sourceId || entry?.nodeId || entry?.id
                  ),
                  sourceHandle: normalizeName(
                      entry?.sourceHandle || entry?.handle
                  ),
              }))
              .filter((entry) => entry.sourceId)
        : [];

    if (stored.length > 0) return stored;

    return [
        {
            sourceId: normalizeName(
                edge?.data?.boundaryOriginalSource ||
                    edge?.data?.compoundOriginalSource ||
                    edge?.data?.parallelOriginalSource ||
                    edge?.source
            ),
            sourceHandle: normalizeName(
                edge?.data?.boundaryOriginalSourceHandle ||
                    edge?.data?.compoundOriginalSourceHandle ||
                    edge?.data?.parallelOriginalSourceHandle ||
                    edge?.sourceHandle ||
                    edge?.label
            ),
        },
    ];
};

const buildNodeLookup = (nodes = []) => {
    const byName = new Map();
    const byId = new Map(nodes.map((node) => [node.id, node]));

    nodes.forEach((node) => {
        nodeNames(node).forEach((name) => {
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name).push(node);
        });
    });

    return { byName, byId };
};

const preferCanonicalNode = (candidates = []) =>
    candidates.find(
        (node) =>
            !node?.data?.cloneOfNodeId &&
            !node?.data?.isSkillClone &&
            !node?.data?.isStateClone
    ) || candidates[0] || null;

const escapeRegExp = (value) =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Match a runtime event against an SCXML/editor event descriptor.
 *
 * The editor can contain both normalized exit tokens (`success`, `*`,
 * `success.*`) and raw SCXML descriptors (`Talk.*`). Runtime logs contain
 * the actually fired event (`Talk.success`). A single `*` matches one event
 * segment, while `**` matches any remaining suffix. A bare `*` is treated as
 * the skill-wide wildcard used by the editor.
 */
const wildcardEventMatches = (descriptor, actualEvent) => {
    const pattern = normalizeName(descriptor);
    const actual = normalizeName(actualEvent);
    if (!pattern || !actual) return false;
    if (pattern === "*") return true;

    let regexSource = "";
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        if (char !== "*") {
            regexSource += escapeRegExp(char);
            continue;
        }

        if (pattern[index + 1] === "*") {
            regexSource += ".*";
            index += 1;
        } else {
            regexSource += "[^.]+";
        }
    }

    return new RegExp(`^${regexSource}$`).test(actual);
};

const eventDescriptorMatches = (handle, step) => {
    const descriptor = normalizeName(handle);
    const rawEvent = normalizeName(step?.event);
    const sourceName = normalizeName(step?.source);
    const actualToken = getTransitionExitToken(rawEvent, sourceName);
    if (!descriptor || !rawEvent) return false;

    // SCXML allows an event attribute to contain more than one descriptor.
    const descriptors = descriptor.split(/\s+/).filter(Boolean);

    return descriptors.some((candidate) => {
        // Raw descriptors, e.g. `Talk.*` against the logged `Talk.success`.
        if (wildcardEventMatches(candidate, rawEvent)) return true;

        // Normalized editor handles, e.g. `*` / `success.*` against the
        // exit-token part of the runtime event.
        if (wildcardEventMatches(candidate, actualToken)) return true;

        // Some imported edges keep the full event while others keep only the
        // exit token. Normalize the descriptor as a final compatibility pass.
        const descriptorToken = getTransitionExitToken(candidate, sourceName);
        return wildcardEventMatches(descriptorToken, actualToken);
    });
};

const getSlotDefinition = (node, edge) => {
    const access = edge?.data?.access;
    const slotIndex = Number(edge?.data?.slotIndex);
    if (!Number.isInteger(slotIndex)) return null;
    if (access === "read") return node?.data?.inSlots?.[slotIndex] || null;
    if (access === "write") return node?.data?.outSlots?.[slotIndex] || null;
    return null;
};

const resolveSlotSampleBindings = (sample, node, slotEdges = []) => {
    if (!node) return [];

    const connected = slotEdges.filter((edge) => {
        if (!isSlotEdge(edge)) return false;
        const skillNodeId = normalizeName(edge?.data?.skillNodeId || edge?.source);
        return skillNodeId === node.id;
    });
    if (connected.length === 0) return [];

    let candidates = connected;
    if (sample.slotKey) {
        const keyed = connected.filter((edge) => {
            const definition = getSlotDefinition(node, edge);
            return normalizeName(definition?.key) === normalizeName(sample.slotKey);
        });
        if (keyed.length > 0) candidates = keyed;
    }

    const preferredAccess = sample.kind === "write" ? "write" : "read";
    const preferred = candidates.filter(
        (edge) => normalizeName(edge?.data?.access) === preferredAccess
    );
    if (preferred.length > 0) candidates = preferred;

    // ObjectSlot itself does not log the slot name. If the surrounding
    // SkillConfigurator lines did not identify a unique slot key and more than
    // one edge of the required access type remains, do not guess and paint the
    // same value onto every slot.
    if (!sample.slotKey && candidates.length !== 1) return [];

    return candidates
        .map((edge) => ({
            edgeId: edge.id,
            access: normalizeName(edge?.data?.access),
            path: normalizeName(edge?.data?.path).replace(/^\/+/, ""),
        }))
        .filter((binding) => binding.edgeId && binding.path);
};

const resolveSlotSamplePaths = (sample, node, slotEdges = []) =>
    Array.from(
        new Set(
            resolveSlotSampleBindings(sample, node, slotEdges).map(
                (binding) => binding.path
            )
        )
    );

export const resolveRuntimeTrace = (steps = [], nodes = [], edges = []) => {
    const { byName, byId } = buildNodeLookup(nodes);
    const transitionEdges = edges.filter((edge) => !isSlotEdge(edge));

    return steps.map((step, index) => {
        const sourceCandidates = byName.get(normalizeName(step.source)) || [];
        const targetCandidates = byName.get(normalizeName(step.target)) || [];
        const sourceIds = new Set(sourceCandidates.map((node) => node.id));
        const targetIds = new Set(targetCandidates.map((node) => node.id));
        const expectedToken = getTransitionExitToken(step.event, step.source);

        let matchedEdge = null;
        let matchedSourceId = null;
        let matchedSourceHandle = null;

        // Keep graph/SCXML transition order. The runtime takes the first
        // transition whose event descriptor matches and whose condition is
        // enabled. The log already tells us which target was actually entered,
        // so target matching eliminates conditional branches that were not
        // taken. Among the remaining candidates, preserve transition order and
        // highlight the first matching edge.
        for (const edge of transitionEdges) {
            const targetId = normalizeName(getSemanticTargetId(edge));
            if (targetIds.size > 0 && !targetIds.has(targetId)) continue;

            const sourceEntry = getSemanticSourceEntries(edge).find(
                (entry) =>
                    (sourceIds.size === 0 || sourceIds.has(entry.sourceId)) &&
                    eventDescriptorMatches(entry.sourceHandle, step)
            );
            if (!sourceEntry) continue;

            matchedEdge = edge;
            matchedSourceId = sourceEntry.sourceId;
            matchedSourceHandle = sourceEntry.sourceHandle;
            break;
        }

        const sourceNode = matchedSourceId
            ? byId.get(matchedSourceId)
            : preferCanonicalNode(sourceCandidates);
        const targetNode = matchedEdge
            ? byId.get(getSemanticTargetId(matchedEdge)) ||
              preferCanonicalNode(targetCandidates)
            : preferCanonicalNode(targetCandidates);

        return {
            ...step,
            index,
            eventToken: expectedToken,
            matchedEventDescriptor: matchedSourceHandle || null,
            edgeId: matchedEdge?.id || null,
            sourceNodeId: sourceNode?.id || null,
            targetNodeId: targetNode?.id || null,
            resolved: Boolean(matchedEdge && sourceNode && targetNode),
        };
    });
};

export const resolveRuntimeSlotTimeline = (
    steps = [],
    slotSamples = [],
    nodes = [],
    slotEdges = []
) => {
    const { byName } = buildNodeLookup(nodes);

    const resolvedSamples = slotSamples
        .map((sample) => {
            const candidates = byName.get(normalizeName(sample.state)) || [];
            const node = preferCanonicalNode(candidates);
            const bindings = resolveSlotSampleBindings(sample, node, slotEdges);
            const paths = Array.from(new Set(bindings.map((binding) => binding.path)));
            return {
                ...sample,
                nodeId: node?.id || null,
                bindings,
                edgeIds: bindings.map((binding) => binding.edgeId),
                paths,
                resolved: Boolean(node && bindings.length > 0),
            };
        })
        .sort((a, b) => a.line - b.line);

    const snapshots = [];
    const currentValues = new Map();
    let sampleIndex = 0;

    steps.forEach((step) => {
        while (
            sampleIndex < resolvedSamples.length &&
            resolvedSamples[sampleIndex].line <= step.line
        ) {
            const sample = resolvedSamples[sampleIndex];
            sample.paths.forEach((path) => {
                currentValues.set(path, {
                    value: sample.value,
                    timestamp: sample.timestamp,
                    line: sample.line,
                    state: sample.state,
                    kind: sample.kind,
                    slotKey: sample.slotKey,
                });
            });
            sampleIndex += 1;
        }

        snapshots.push(
            Object.fromEntries(
                Array.from(currentValues.entries()).map(([path, value]) => [
                    path,
                    { ...value },
                ])
            )
        );
    });

    return {
        snapshots,
        samples: resolvedSamples,
        unresolvedCount: resolvedSamples.reduce(
            (count, sample) => count + (sample.resolved ? 0 : 1),
            0
        ),
    };
};

export const resolveRuntimeParameterTimeline = (
    steps = [],
    parameterSamples = [],
    nodes = []
) => {
    const { byName } = buildNodeLookup(nodes);

    const resolvedSamples = parameterSamples
        .map((sample) => {
            const candidates = byName.get(normalizeName(sample.state)) || [];
            const node = preferCanonicalNode(candidates);
            return {
                ...sample,
                nodeId: node?.id || null,
                resolved: Boolean(node),
            };
        })
        .sort((a, b) => a.line - b.line);

    const snapshots = [];
    const currentValues = new Map();
    let sampleIndex = 0;

    steps.forEach((step) => {
        while (
            sampleIndex < resolvedSamples.length &&
            resolvedSamples[sampleIndex].line <= step.line
        ) {
            const sample = resolvedSamples[sampleIndex];
            if (sample.nodeId && sample.key) {
                if (!currentValues.has(sample.nodeId)) {
                    currentValues.set(sample.nodeId, new Map());
                }
                currentValues.get(sample.nodeId).set(sample.key, {
                    value: sample.value,
                    timestamp: sample.timestamp,
                    line: sample.line,
                    state: sample.state,
                    key: sample.key,
                });
            }
            sampleIndex += 1;
        }

        snapshots.push(
            Object.fromEntries(
                Array.from(currentValues.entries()).map(([nodeId, values]) => [
                    nodeId,
                    Object.fromEntries(
                        Array.from(values.entries()).map(([key, value]) => [
                            key,
                            { ...value },
                        ])
                    ),
                ])
            )
        );
    });

    return {
        snapshots,
        samples: resolvedSamples,
        unresolvedCount: resolvedSamples.reduce(
            (count, sample) => count + (sample.resolved ? 0 : 1),
            0
        ),
    };
};

const fileStem = (value) =>
    normalizeName(value)
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(xml|scxml)$/i, "") || "";

const findChildSegment = (tab, tabById) => {
    if (!tab?.parentTabId) return "";
    const parent = tabById.get(tab.parentTabId);
    const childSource = normalizeName(tab.sourcePath);
    const childTitle = normalizeName(tab.title);
    const childFileStem = fileStem(tab.fileName || tab.sourcePath);

    const parentSubMachine = (parent?.nodes || []).find((node) => {
        if (node.type !== "submachine") return false;
        const src = normalizeName(node.data?.src);
        const label = normalizeName(node.data?.label || node.data?.fullSkillName);
        return (
            (childSource && src === childSource) ||
            (childTitle && label === childTitle) ||
            (childFileStem && fileStem(src) === childFileStem)
        );
    });

    return normalizeName(
        parentSubMachine?.data?.label ||
            parentSubMachine?.data?.fullSkillName ||
            tab.title ||
            childFileStem
    );
};

/**
 * Build replay contexts for every state-machine tab that is already open.
 * The runtime suffix order is inner -> outer, e.g. s2 inside s1 becomes
 * `#s2#s1` for states/slots and `_s2_s1` for datamodel ids.
 */
export const buildRuntimeReplayContexts = (
    tabs = [],
    activeTabId = null,
    liveState = {}
) => {
    const effectiveTabs = (tabs || []).map((tab) =>
        tab.id === activeTabId
            ? {
                  ...tab,
                  nodes: liveState.nodes ?? tab.nodes ?? [],
                  edges: liveState.edges ?? tab.edges ?? [],
                  slotNodes: liveState.slotNodes ?? tab.slotNodes ?? [],
                  slotEdges: liveState.slotEdges ?? tab.slotEdges ?? [],
                  globalDataModel:
                      liveState.globalDataModel ?? tab.globalDataModel ?? [],
              }
            : tab
    );
    const tabById = new Map(effectiveTabs.map((tab) => [tab.id, tab]));
    const suffixCache = new Map();

    const suffixPartsForTab = (tab) => {
        if (!tab?.parentTabId) return [];
        if (suffixCache.has(tab.id)) return suffixCache.get(tab.id);
        const parent = tabById.get(tab.parentTabId);
        const ownSegment = findChildSegment(tab, tabById);
        const result = [
            ...(ownSegment ? [ownSegment] : []),
            ...suffixPartsForTab(parent),
        ];
        suffixCache.set(tab.id, result);
        return result;
    };

    return effectiveTabs.map((tab) => ({
        tabId: tab.id,
        parentTabId: tab.parentTabId || null,
        title: tab.title || tab.fileName || tab.id,
        suffixParts: suffixPartsForTab(tab),
        nodes: tab.nodes || [],
        edges: tab.edges || [],
        slotNodes: tab.slotNodes || [],
        slotEdges: tab.slotEdges || [],
        globalDataModel: tab.globalDataModel || [],
    }));
};

const stripStateSuffixForContext = (runtimeName, context) => {
    const raw = normalizeName(runtimeName);
    const parts = context?.suffixParts || [];
    if (parts.length === 0) return raw;
    const suffix = `#${parts.join("#")}`;
    if (!raw.endsWith(suffix)) return null;
    return raw.slice(0, -suffix.length);
};

const stripDataSuffixForContext = (runtimeName, context) => {
    const raw = normalizeName(runtimeName);
    const parts = context?.suffixParts || [];
    if (parts.length === 0) return raw;
    const suffix = `_${parts.join("_")}`;
    if (!raw.endsWith(suffix)) return raw;
    return raw.slice(0, -suffix.length);
};

const subMachineNames = (node) =>
    Array.from(
        nodeNames(node)
    ).filter(Boolean).sort((a, b) => b.length - a.length);

const indexRuntimeReplayContexts = (contexts = []) =>
    (contexts || []).map((context) => ({
        ...context,
        runtimeReplayIndex: {
            nodeLookup: buildNodeLookup(context.nodes || []),
            transitionEdges: (context.edges || []).filter(
                (edge) => !isSlotEdge(edge)
            ),
        },
    }));

const resolveRuntimeStateInContext = (runtimeName, context) => {
    const localName = stripStateSuffixForContext(runtimeName, context);
    if (localName == null) return null;

    const { byName } =
        context?.runtimeReplayIndex?.nodeLookup ||
        buildNodeLookup(context?.nodes || []);
    const exact = preferCanonicalNode(byName.get(localName) || []);
    if (exact) {
        return {
            node: exact,
            localName,
            exact: true,
            collapsed: false,
        };
    }

    // If the deeper sub-SM is not open, keep replay at the deepest visible
    // sub-SM node instead of failing to resolve the internal runtime state.
    const wrappers = (context?.nodes || [])
        .filter((node) => node.type === "submachine")
        .flatMap((node) =>
            subMachineNames(node).map((name) => ({ node, name }))
        )
        .filter(({ name }) =>
            localName === name || localName.endsWith(`#${name}`)
        )
        .sort((a, b) => b.name.length - a.name.length);

    if (wrappers.length > 0) {
        return {
            node: wrappers[0].node,
            localName,
            exact: false,
            collapsed: true,
        };
    }

    return null;
};

const resolveStepInContext = (step, context) => {
    const source = resolveRuntimeStateInContext(step.source, context);
    const target = resolveRuntimeStateInContext(step.target, context);
    if (!source && !target) return null;

    const { byId } =
        context?.runtimeReplayIndex?.nodeLookup ||
        buildNodeLookup(context.nodes || []);
    const transitionEdges =
        context?.runtimeReplayIndex?.transitionEdges ||
        (context.edges || []).filter((edge) => !isSlotEdge(edge));
    const sourceIds = new Set(source?.node ? [source.node.id] : []);
    const targetIds = new Set(target?.node ? [target.node.id] : []);
    const localStep = {
        ...step,
        source: source?.localName || step.source,
        target: target?.localName || step.target,
    };

    let matchedEdge = null;
    let matchedSourceId = null;
    let matchedSourceHandle = null;

    // Preserve graph transition order. The runtime target from the log filters
    // conditional alternatives; event descriptors still support wildcards.
    for (const edge of transitionEdges) {
        const targetId = normalizeName(getSemanticTargetId(edge));
        if (targetIds.size > 0 && !targetIds.has(targetId)) continue;

        const sourceEntry = getSemanticSourceEntries(edge).find(
            (entry) =>
                (sourceIds.size === 0 || sourceIds.has(entry.sourceId)) &&
                eventDescriptorMatches(entry.sourceHandle, localStep)
        );
        if (!sourceEntry) continue;

        matchedEdge = edge;
        matchedSourceId = sourceEntry.sourceId;
        matchedSourceHandle = sourceEntry.sourceHandle;
        break;
    }

    const sourceNode = matchedSourceId
        ? byId.get(matchedSourceId) || source?.node || null
        : source?.node || null;
    const targetNode = matchedEdge
        ? byId.get(getSemanticTargetId(matchedEdge)) || target?.node || null
        : target?.node || null;
    const collapsedInsideClosedSubMachine = Boolean(
        !matchedEdge &&
            sourceNode &&
            targetNode &&
            sourceNode.id === targetNode.id &&
            sourceNode.type === "submachine" &&
            (source?.collapsed || target?.collapsed)
    );

    let score = (context.suffixParts?.length || 0) * 2;
    if (source?.exact) score += 20;
    else if (source?.collapsed) score += 5;
    if (target?.exact) score += 20;
    else if (target?.collapsed) score += 5;
    if (matchedEdge) score += 100;
    if (collapsedInsideClosedSubMachine) score += 15;

    return {
        context,
        source,
        target,
        sourceNode,
        targetNode,
        matchedEdge,
        matchedSourceHandle,
        collapsedInsideClosedSubMachine,
        score,
    };
};

const bestContextForRuntimeState = (runtimeState, contexts = [], exactOnly = false) => {
    const candidates = (contexts || [])
        .map((context) => ({
            context,
            resolved: resolveRuntimeStateInContext(runtimeState, context),
        }))
        .filter(({ resolved }) => resolved && (!exactOnly || resolved.exact))
        .sort((a, b) => {
            const exactDelta = Number(b.resolved.exact) - Number(a.resolved.exact);
            if (exactDelta) return exactDelta;
            return (
                (b.context.suffixParts?.length || 0) -
                (a.context.suffixParts?.length || 0)
            );
        });
    return candidates[0] || null;
};

export const resolveRuntimeTraceAcrossTabs = (
    steps = [],
    contexts = []
) =>
    steps.map((step, index) => {
        const candidates = (contexts || [])
            .map((context) => resolveStepInContext(step, context))
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        const best = candidates[0] || null;
        const expectedToken = getTransitionExitToken(step.event, step.source);

        return {
            ...step,
            index,
            eventToken: expectedToken,
            tabId: best?.context?.tabId || null,
            tabTitle: best?.context?.title || "",
            localSource: best?.source?.localName || step.source,
            localTarget: best?.target?.localName || step.target,
            matchedEventDescriptor: best?.matchedSourceHandle || null,
            edgeId: best?.matchedEdge?.id || null,
            sourceNodeId: best?.sourceNode?.id || null,
            targetNodeId: best?.targetNode?.id || null,
            collapsedIntoSubMachine: Boolean(
                best?.collapsedInsideClosedSubMachine
            ),
            resolved: Boolean(
                best &&
                    best.sourceNode &&
                    best.targetNode &&
                    (best.matchedEdge || best.collapsedInsideClosedSubMachine)
            ),
        };
    });

export const resolveRuntimeSlotTimelineAcrossTabs = (
    steps = [],
    slotSamples = [],
    contexts = []
) => {
    const resolvedSamples = (slotSamples || [])
        .map((sample) => {
            const best = bestContextForRuntimeState(sample.state, contexts, true);
            const context = best?.context || null;
            const node = best?.resolved?.node || null;
            const bindings = context
                ? resolveSlotSampleBindings(sample, node, context.slotEdges || [])
                : [];
            const paths = Array.from(new Set(bindings.map((binding) => binding.path)));
            return {
                ...sample,
                tabId: context?.tabId || null,
                nodeId: node?.id || null,
                localState: best?.resolved?.localName || sample.state,
                bindings,
                edgeIds: bindings.map((binding) => binding.edgeId),
                paths,
                resolved: Boolean(context && node && bindings.length > 0),
            };
        })
        .sort((a, b) => a.line - b.line);

    const snapshots = [];
    const currentValues = new Map();
    let sampleIndex = 0;

    steps.forEach((step) => {
        while (
            sampleIndex < resolvedSamples.length &&
            resolvedSamples[sampleIndex].line <= step.line
        ) {
            const sample = resolvedSamples[sampleIndex];
            if (sample.tabId) {
                sample.paths.forEach((path) => {
                    currentValues.set(`${sample.tabId}\u001f${path}`, {
                        ...sample,
                    });
                });
            }
            sampleIndex += 1;
        }

        const byTab = {};
        currentValues.forEach((value, compoundKey) => {
            const separator = compoundKey.indexOf("\u001f");
            const tabId = compoundKey.slice(0, separator);
            const path = compoundKey.slice(separator + 1);
            if (!byTab[tabId]) byTab[tabId] = {};
            byTab[tabId][path] = { ...value };
        });
        snapshots.push(byTab);
    });

    return {
        snapshots,
        samples: resolvedSamples,
        unresolvedCount: resolvedSamples.reduce(
            (count, sample) => count + (sample.resolved ? 0 : 1),
            0
        ),
    };
};

export const resolveRuntimeParameterTimelineAcrossTabs = (
    steps = [],
    parameterSamples = [],
    contexts = []
) => {
    const resolvedSamples = (parameterSamples || [])
        .map((sample) => {
            const best = bestContextForRuntimeState(sample.state, contexts, true);
            return {
                ...sample,
                tabId: best?.context?.tabId || null,
                nodeId: best?.resolved?.node?.id || null,
                localState: best?.resolved?.localName || sample.state,
                resolved: Boolean(best?.context && best?.resolved?.node),
            };
        })
        .sort((a, b) => a.line - b.line);

    const snapshots = [];
    const currentValues = new Map();
    let sampleIndex = 0;

    steps.forEach((step) => {
        while (
            sampleIndex < resolvedSamples.length &&
            resolvedSamples[sampleIndex].line <= step.line
        ) {
            const sample = resolvedSamples[sampleIndex];
            if (sample.tabId && sample.nodeId && sample.key) {
                const nodeKey = `${sample.tabId}\u001f${sample.nodeId}`;
                if (!currentValues.has(nodeKey)) currentValues.set(nodeKey, new Map());
                currentValues.get(nodeKey).set(sample.key, { ...sample });
            }
            sampleIndex += 1;
        }

        const byTab = {};
        currentValues.forEach((values, nodeKey) => {
            const separator = nodeKey.indexOf("\u001f");
            const tabId = nodeKey.slice(0, separator);
            const nodeId = nodeKey.slice(separator + 1);
            if (!byTab[tabId]) byTab[tabId] = {};
            byTab[tabId][nodeId] = Object.fromEntries(
                Array.from(values.entries()).map(([key, value]) => [
                    key,
                    { ...value },
                ])
            );
        });
        snapshots.push(byTab);
    });

    return {
        snapshots,
        samples: resolvedSamples,
        unresolvedCount: resolvedSamples.reduce(
            (count, sample) => count + (sample.resolved ? 0 : 1),
            0
        ),
    };
};

const resolveRuntimeDataSamplesAcrossTabs = (dataSamples = [], contexts = []) =>
    (dataSamples || []).map((sample) => {
        // Datamodel ids carry the sub-SM context with `_` rather than `#`.
        // Prefer the deepest open tab whose suffix strips to a real local
        // datamodel variable. This is important for assignments emitted while
        // entering a sub-SM wrapper, where `sample.state` itself may still be
        // the parent state (for example `s1`) and therefore cannot identify the
        // child tab on its own.
        const candidates = (contexts || [])
            .map((context) => {
                const localKey = stripDataSuffixForContext(sample.key, context);
                const knownVariable = (context.globalDataModel || []).some(
                    (entry) =>
                        normalizeName(entry?.id) === normalizeName(localKey)
                );
                const stateResolution = resolveRuntimeStateInContext(
                    sample.state,
                    context
                );
                const suffixParts = context.suffixParts || [];
                const suffix = suffixParts.length
                    ? `_${suffixParts.join("_")}`
                    : "";
                const dataSuffixMatches =
                    suffixParts.length === 0 ||
                    normalizeName(sample.key).endsWith(suffix);

                if (!knownVariable && !stateResolution) return null;

                let score = suffixParts.length * 2;
                if (dataSuffixMatches) score += 10;
                if (knownVariable) score += 100;
                if (stateResolution?.exact) score += 20;
                else if (stateResolution?.collapsed) score += 5;

                return {
                    context,
                    localKey,
                    knownVariable,
                    stateResolution,
                    score,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        const best = candidates[0] || null;
        const context = best?.context || null;
        return {
            ...sample,
            tabId: context?.tabId || null,
            localState: best?.stateResolution?.localName || sample.state,
            localKey: best?.localKey || sample.key,
            resolved: Boolean(context && (best.knownVariable || best.stateResolution)),
            knownVariable: Boolean(best?.knownVariable),
        };
    });


const buildInitialRuntimeDataValues = (contexts = []) => {
    const values = new Map();
    const pending = [];

    (contexts || []).forEach((context) => {
        (context.globalDataModel || []).forEach((entry) => {
            const localKey = normalizeName(entry?.id);
            if (!localKey || localKey.startsWith("#")) return;
            const runtimeKey = runtimeDataKeyForContext(localKey, context);
            pending.push({
                context,
                runtimeKey,
                expression: entry?.expr,
            });
        });
    });

    // Datamodel initializers can reference variables declared earlier. Resolve
    // them in a few passes so simple dependency chains get concrete values
    // without using eval/new Function.
    for (let pass = 0; pass < pending.length + 1 && pending.length > 0; pass += 1) {
        let progress = false;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
            const item = pending[index];
            const expression = normalizeName(item.expression);
            if (!expression) continue;
            const result = evaluateRuntimeExpression(
                expression,
                values,
                item.context
            );
            if (!result.ok) continue;
            values.set(item.runtimeKey, result.value);
            pending.splice(index, 1);
            progress = true;
        }
        if (!progress) break;
    }

    return values;
};

const evaluateRuntimeDataSamples = (samples = [], contexts = []) => {
    const values = buildInitialRuntimeDataValues(contexts);
    const contextByTabId = new Map(
        (contexts || []).map((context) => [context.tabId, context])
    );

    return [...(samples || [])]
        .sort((a, b) => a.line - b.line)
        .map((sample) => {
            const context = contextByTabId.get(sample.tabId) || null;
            const runtimeKey = normalizeName(sample.key) ||
                runtimeDataKeyForContext(sample.localKey, context);
            const previousValue = values.has(runtimeKey)
                ? values.get(runtimeKey)
                : undefined;
            const result = evaluateRuntimeExpression(
                sample.expr,
                values,
                context
            );

            if (result.ok && runtimeKey) {
                values.set(runtimeKey, result.value);
            }

            return {
                ...sample,
                runtimeKey,
                previousValue,
                evaluated: result.ok,
                evaluatedValue: result.ok ? result.value : undefined,
                evaluationError: result.ok ? "" : result.error,
                value: result.ok ? result.value : sample.value,
            };
        });
};

const assignSamplesToSteps = (steps, samples) =>
    steps.map((step, index) => {
        const previousLine = index > 0 ? steps[index - 1].line : 0;
        return samples.filter(
            (sample) => sample.line > previousLine && sample.line <= step.line
        );
    });

/**
 * Changes visible in the runtime drawer for each transition step. Slot writes,
 * parameter assignments and datamodel changes are kept separate. Datamodel
 * lines that are immediately mirrored by a parameter log line are suppressed
 * as variables so the drawer does not show the same parameter twice.
 */
const buildRuntimeChangesTimelineFromResolved = (
    steps = [],
    slotTimeline = { samples: [] },
    parameterTimeline = { samples: [] },
    dataSamples = [],
    contexts = []
) => {
    const resolvedDataSamples = evaluateRuntimeDataSamples(
        resolveRuntimeDataSamplesAcrossTabs(dataSamples, contexts),
        contexts
    );

    const mirroredParameterDataLines = new Set();
    resolvedDataSamples.forEach((dataSample) => {
        const mirror = parameterTimeline.samples.find(
            (parameter) =>
                normalizeName(parameter.state) === normalizeName(dataSample.state) &&
                normalizeName(parameter.key) === normalizeName(dataSample.key) &&
                Math.abs(parameter.line - dataSample.line) <= 2
        );
        if (mirror) mirroredParameterDataLines.add(dataSample.line);
    });

    const slotWrites = slotTimeline.samples.filter(
        (sample) => sample.kind === "write"
    );
    const slotReads = slotTimeline.samples.filter(
        (sample) => sample.kind === "read"
    );
    const variables = resolvedDataSamples.filter(
        (sample) =>
            !normalizeName(sample.key).startsWith("#") &&
            !mirroredParameterDataLines.has(sample.line)
    );

    const writesByStep = assignSamplesToSteps(steps, slotWrites);
    const readsByStep = assignSamplesToSteps(steps, slotReads);
    const accessesByStep = assignSamplesToSteps(steps, slotTimeline.samples);
    const paramsByStep = assignSamplesToSteps(steps, parameterTimeline.samples);
    const variablesByStep = assignSamplesToSteps(steps, variables);

    return {
        steps: steps.map((step, index) => ({
            stepIndex: index,
            timestamp: step.timestamp,
            slotWrites: writesByStep[index] || [],
            slotReads: readsByStep[index] || [],
            slotAccesses: accessesByStep[index] || [],
            parameters: paramsByStep[index] || [],
            variables: variablesByStep[index] || [],
        })),
        dataSamples: resolvedDataSamples,
    };
};

export const resolveRuntimeChangesTimeline = (
    steps = [],
    slotSamples = [],
    parameterSamples = [],
    dataSamples = [],
    contexts = []
) => {
    const slotTimeline = resolveRuntimeSlotTimelineAcrossTabs(
        steps,
        slotSamples,
        contexts
    );
    const parameterTimeline = resolveRuntimeParameterTimelineAcrossTabs(
        steps,
        parameterSamples,
        contexts
    );

    return buildRuntimeChangesTimelineFromResolved(
        steps,
        slotTimeline,
        parameterTimeline,
        dataSamples,
        contexts
    );
};

const runtimeTraceIndex = (resolvedSteps = [], contexts = []) => {
    const edgeByIdByTab = new Map();
    const traceEdgeIdsByTab = new Map();
    const traceNodeIdsByTab = new Map();

    (contexts || []).forEach((context) => {
        edgeByIdByTab.set(
            context.tabId,
            new Map((context.edges || []).map((edge) => [edge.id, edge]))
        );
    });

    const ensureSet = (map, key) => {
        if (!map.has(key)) map.set(key, new Set());
        return map.get(key);
    };

    (resolvedSteps || []).forEach((step) => {
        if (!step.tabId) return;
        const nodeIds = ensureSet(traceNodeIdsByTab, step.tabId);
        const edgeIds = ensureSet(traceEdgeIdsByTab, step.tabId);

        if (step.sourceNodeId) nodeIds.add(step.sourceNodeId);
        if (step.targetNodeId) nodeIds.add(step.targetNodeId);

        if (step.edgeId) {
            edgeIds.add(step.edgeId);
            const edge = edgeByIdByTab.get(step.tabId)?.get(step.edgeId);
            if (edge?.source) nodeIds.add(edge.source);
            if (edge?.target) nodeIds.add(edge.target);
        }
    });

    return { edgeByIdByTab, traceEdgeIdsByTab, traceNodeIdsByTab };
};

const runtimeSlotEdgeIndex = (changesTimeline = { steps: [] }) =>
    (changesTimeline.steps || []).map((step) => {
        const byTab = new Map();
        (step.slotAccesses || []).forEach((sample) => {
            if (!sample.tabId) return;
            if (!byTab.has(sample.tabId)) byTab.set(sample.tabId, new Set());
            const ids = byTab.get(sample.tabId);
            (sample.edgeIds || []).forEach((edgeId) => {
                if (edgeId) ids.add(edgeId);
            });
        });
        return byTab;
    });

/**
 * Prepare every expensive runtime-replay structure once. The caller can yield
 * between stages so a loading overlay remains responsive while large logs are
 * parsed/resolved. The returned object is safe to keep as an in-memory cache
 * for playback and timeline seeking.
 */
export const prepareRuntimeReplayCache = async (
    runtimeLog = {},
    contexts = [],
    { onProgress, yieldControl } = {}
) => {
    const report = async (phase, progress) => {
        onProgress?.({ phase, progress });
        if (yieldControl) await yieldControl();
    };

    const steps = runtimeLog?.steps || [];
    await report("Indexing open state machines…", 0.22);
    const preparedContexts = indexRuntimeReplayContexts(contexts);

    await report("Resolving state transitions…", 0.34);
    const resolvedSteps = resolveRuntimeTraceAcrossTabs(steps, preparedContexts);

    await report("Resolving slot values and connections…", 0.52);
    const slotTimeline = resolveRuntimeSlotTimelineAcrossTabs(
        steps,
        runtimeLog?.slotSamples || [],
        preparedContexts
    );

    await report("Resolving runtime parameters…", 0.66);
    const parameterTimeline = resolveRuntimeParameterTimelineAcrossTabs(
        steps,
        runtimeLog?.parameterSamples || [],
        preparedContexts
    );

    await report("Evaluating assignments…", 0.8);
    const changesTimeline = buildRuntimeChangesTimelineFromResolved(
        steps,
        slotTimeline,
        parameterTimeline,
        runtimeLog?.dataSamples || [],
        preparedContexts
    );

    await report("Building replay indexes…", 0.92);
    const traceIndex = runtimeTraceIndex(resolvedSteps, preparedContexts);
    const slotEdgeIdsByStep = runtimeSlotEdgeIndex(changesTimeline);

    await report("Replay ready", 1);
    return {
        resolvedSteps,
        slotTimeline,
        parameterTimeline,
        changesTimeline,
        slotEdgeIdsByStep,
        contexts: preparedContexts,
        ...traceIndex,
    };
};
