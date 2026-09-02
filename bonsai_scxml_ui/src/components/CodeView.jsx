import {  useEffect, useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";

function CodeView({ codeString, activeMode, setActiveMode, onCodeChange,}) {
    const [code, setCode] = useState(codeString || "");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
            setCode(codeString || "");
        }, [codeString]);

    const handleCodeChange = (e) => {
            const newCode = e.target.value;
            setCode(newCode);
            if (onCodeChange) {
                onCodeChange(newCode);
            }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="inline-code-view">
            <div className="mode-button-group-floating">
                {["event", "slots", "both", "code"].map((m) => (
                    <button
                        key={m}
                        className={`mode-button ${activeMode === m ? "active" : ""}`}
                        onClick={() => setActiveMode(m)}
                    >
                        {m === "event" ? "Event Mode" : m === "slots" ? "Slot Mode" : m === "both" ? "Both Mode" : "Code View"}
                    </button>
                ))}
            </div>

            <div className="code-view-toolbar">
                <span>Generated SCXML / XML</span>
                <button className="modal-copy-button" onClick={handleCopy}>
                    {copied ? <FiCheck color="#2ecc71" /> : <FiCopy />}
                    <span>{copied ? "Copy!" : "Copy"}</span>
                </button>
            </div>
             <textarea
                            className="code-view-body"
                            value={code}
                            onChange={handleCodeChange}
                            spellCheck={false}
                            wrap="off"
             />
        </div>
    );
}

export default CodeView;