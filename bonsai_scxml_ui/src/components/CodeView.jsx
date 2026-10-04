import { useEffect, useMemo, useRef, useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import ModeSwitcher from "./ModeSwitcher.jsx";
import { isTauri } from "../tauri-client.js";
import {
    buildFallbackEditorScxml,
    serializeEditorGraphWithRust,
} from "../utils/scxmlRustExport.js";
import {
    applyGeneratedCode,
    createGeneratedCodeDraft,
    editGeneratedCodeDraft,
} from "./canvasCodeDraft.js";

function CodeEditor({ code, activeMode, setActiveMode, onCodeChange }) {
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef(null);
    const copyAttemptRef = useRef(0);

    useEffect(() => () => {
        copyAttemptRef.current += 1;
        clearTimeout(copyTimerRef.current);
    }, []);

    const handleCopy = async () => {
        const attempt = ++copyAttemptRef.current;
        try {
            await navigator.clipboard.writeText(code);
            if (attempt !== copyAttemptRef.current) return;
            setCopied(true);
            clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Could not copy Code View SCXML:", error);
        }
    };

    return (
        <div className="inline-code-view">
            <div className="editor-canvas-toolbar code-view-toolbar">
                <ModeSwitcher activeMode={activeMode} setActiveMode={setActiveMode} />
                <div className="code-view-actions">
                    <span>Generated SCXML / XML</span>
                    <button type="button" className="modal-copy-button" onClick={handleCopy}>
                        {copied ? <FiCheck color="#2ecc71" /> : <FiCopy />}
                        <span>{copied ? "Copy!" : "Copy"}</span>
                    </button>
                </div>
            </div>
            <textarea
                className="code-view-body"
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                spellCheck={false}
                wrap="off"
            />
        </div>
    );
}

function SuppliedCodeView({ codeString, onCodeChange, ...props }) {
    const source = codeString || "";
    const [draft, setDraft] = useState({ source, code: source });

    // Replace external drafts before commit, not in an effect after painting.
    if (draft.source !== source) {
        setDraft({ source, code: source });
    }

    return (
        <CodeEditor
            {...props}
            code={draft.code}
            onCodeChange={(code) => {
                setDraft({ source, code });
                onCodeChange?.(code);
            }}
        />
    );
}

const createCodeViewDraft = (graph) => {
    const draft = createGeneratedCodeDraft(graph);
    return isTauri()
        ? draft
        : applyGeneratedCode(
            draft,
            graph,
            buildFallbackEditorScxml(graph, "Rust/Tauri backend unavailable")
        );
};

function GeneratedCodeView({ nodes, edges, globalDataModel, manualSlots, onCodeChange, ...props }) {
    const graph = useMemo(
        () => ({ nodes, edges, globalDataModel, manualSlots }),
        [nodes, edges, globalDataModel, manualSlots]
    );
    const [draft, setDraft] = useState(() => createCodeViewDraft(graph));

    if (draft.graph !== graph) {
        setDraft(createCodeViewDraft(graph));
    }

    useEffect(() => {
        if (!isTauri()) return undefined;
        let cancelled = false;

        const generateCode = async () => {
            let code;
            try {
                // Code View uses the same canonical Rust serializer as Save.
                code = await serializeEditorGraphWithRust(graph);
            } catch (error) {
                if (cancelled) return;
                console.error("Could not generate Code View SCXML:", error);
                code = buildFallbackEditorScxml(graph, error);
            }

            if (!cancelled) {
                setDraft((current) => applyGeneratedCode(current, graph, code));
            }
        };

        void generateCode();
        return () => {
            cancelled = true;
        };
    }, [graph]);

    return (
        <CodeEditor
            {...props}
            code={draft.code}
            onCodeChange={(code) => {
                setDraft((current) => editGeneratedCodeDraft(current, code));
                onCodeChange?.(code);
            }}
        />
    );
}

export default function CodeView(props) {
    return props.nodes !== undefined
        ? <GeneratedCodeView {...props} />
        : <SuppliedCodeView {...props} />;
}
