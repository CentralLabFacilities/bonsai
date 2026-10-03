import { useEffect, useRef, useState } from "react";
import { FiFolder } from "react-icons/fi";
import { isTauri, selectDirectory } from "../tauri-client.js";

const normalizeFileName = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /\.(xml|scxml)$/i.test(trimmed) ? trimmed : `${trimmed}.xml`;
};

function CreateSubMachineForm({
    defaultDirectory = "",
    defaultFileName = "SubMachine.xml",
    onCancel,
    onConfirm,
}) {
    const [directory, setDirectory] = useState(defaultDirectory || "");
    const [fileName, setFileName] = useState(defaultFileName || "SubMachine.xml");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const nameInputRef = useRef(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        const timer = window.setTimeout(() => {
            nameInputRef.current?.focus();
            nameInputRef.current?.select();
        }, 0);
        return () => {
            mountedRef.current = false;
            window.clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape" && !isSubmitting) {
                event.preventDefault();
                onCancel?.();
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [isSubmitting, onCancel]);

    const submit = async (event) => {
        event?.preventDefault?.();
        if (isSubmitting) return;
        const normalizedName = normalizeFileName(fileName);
        if (!directory.trim()) {
            alert("Please choose a directory for the state-machine file.");
            return;
        }
        if (!normalizedName) {
            alert("Please enter a state-machine file name.");
            return;
        }

        setIsSubmitting(true);
        try {
            const accepted = await onConfirm?.({
                directory: directory.trim(),
                fileName: normalizedName,
            });
            if (mountedRef.current && accepted !== false) {
                onCancel?.();
            }
        } finally {
            if (mountedRef.current) setIsSubmitting(false);
        }
    };

    const browseDirectory = async () => {
        if (!isTauri()) return;
        const selected = await selectDirectory("Choose state-machine directory");
        if (mountedRef.current && selected) setDirectory(selected);
    };

    return (
        <div
            className="submachine-create-overlay nodrag nopan"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSubmitting) onCancel?.();
            }}
        >
            <form className="submachine-create-dialog" onSubmit={submit}>
                <h3>Create Sub-State-Machine</h3>
                <p>Choose where the new SCXML file should be created.</p>

                <label className="submachine-create-field">
                    <span>Directory</span>
                    <div className="submachine-create-directory-row">
                        <input
                            value={directory}
                            onChange={(event) => setDirectory(event.target.value)}
                            placeholder="/path/to/behaviors"
                            spellCheck={false}
                        />
                        {isTauri() && (
                            <button
                                type="button"
                                className="submachine-create-browse"
                                onClick={browseDirectory}
                                title="Choose directory"
                            >
                                <FiFolder />
                            </button>
                        )}
                    </div>
                </label>

                <label className="submachine-create-field">
                    <span>File name</span>
                    <input
                        ref={nameInputRef}
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                        placeholder="MyBehavior.xml"
                        spellCheck={false}
                    />
                </label>

                <div className="submachine-create-actions">
                    <button type="button" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button type="submit" className="primary" disabled={isSubmitting}>
                        {isSubmitting ? "Creating…" : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function CreateSubMachineModal({
    isOpen,
    defaultDirectory = "",
    defaultFileName = "SubMachine.xml",
    ...props
}) {
    return isOpen ? (
        <CreateSubMachineForm
            key={JSON.stringify([defaultDirectory, defaultFileName])}
            defaultDirectory={defaultDirectory}
            defaultFileName={defaultFileName}
            {...props}
        />
    ) : null;
}
