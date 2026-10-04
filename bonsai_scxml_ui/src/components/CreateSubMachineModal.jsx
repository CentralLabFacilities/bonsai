import { useId, useLayoutEffect, useRef, useState } from "react";
import { FiFolder } from "react-icons/fi";
import { isTauri, selectDirectory } from "../tauri-client.js";
import { CreationDialog } from "./EditorOverlays.jsx";
import { Button, IconButton, TextInput } from "./ui/index.js";

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
    const [isBrowsing, setIsBrowsing] = useState(false);
    const [error, setError] = useState("");
    const nameInputRef = useRef(null);
    const mountedRef = useRef(false);
    const submittingRef = useRef(false);
    const browseRequestRef = useRef(null);
    const labelId = useId();

    useLayoutEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            browseRequestRef.current = null;
        };
    }, []);

    const cancel = () => {
        if (submittingRef.current) return;
        if (browseRequestRef.current) browseRequestRef.current.cancelled = true;
        onCancel?.();
    };

    const submit = async (event) => {
        event?.preventDefault?.();
        if (submittingRef.current || browseRequestRef.current) return;
        const normalizedName = normalizeFileName(fileName);
        if (!directory.trim()) {
            alert("Please choose a directory for the state-machine file.");
            return;
        }
        if (!normalizedName) {
            alert("Please enter a state-machine file name.");
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        setError("");
        try {
            const accepted = await onConfirm?.({
                directory: directory.trim(),
                fileName: normalizedName,
            });
            if (mountedRef.current && accepted !== false) {
                onCancel?.();
            }
        } catch (submitError) {
            if (mountedRef.current) {
                const message = String(submitError?.message || submitError || "").trim() || "Unknown error.";
                setError(`Could not create state machine. ${message} Retry with Create.`);
            }
        } finally {
            submittingRef.current = false;
            if (mountedRef.current) setIsSubmitting(false);
        }
    };

    const browseDirectory = async () => {
        if (!isTauri() || submittingRef.current || browseRequestRef.current) return;
        const request = { cancelled: false };
        browseRequestRef.current = request;
        setIsBrowsing(true);
        try {
            const selected = await selectDirectory("Choose state-machine directory");
            if (!mountedRef.current || browseRequestRef.current !== request || request.cancelled || !selected) return;
            setDirectory(selected);
            setError("");
        } catch (pickError) {
            if (!mountedRef.current || browseRequestRef.current !== request || request.cancelled) return;
            const message = String(pickError?.message || pickError || "").trim() || "Unknown error.";
            setError(`Could not choose directory. ${message} Retry with Choose directory or enter a path.`);
        } finally {
            if (browseRequestRef.current === request) {
                browseRequestRef.current = null;
                if (mountedRef.current) setIsBrowsing(false);
            }
        }
    };

    return (
        <CreationDialog
            className="submachine-create-overlay nodrag nopan"
            labelledBy={`${labelId}-title`}
            describedBy={`${labelId}-description`}
            initialFocusRef={nameInputRef}
            selectInitialFocus
            busy={isSubmitting}
            onCancel={cancel}
        >
            <form className="submachine-create-dialog" onSubmit={submit}>
                <h3 id={`${labelId}-title`}>Create Sub-State-Machine</h3>
                <p id={`${labelId}-description`}>Choose where the new SCXML file should be created.</p>

                <label className="submachine-create-field">
                    <span>Directory</span>
                    <div className="submachine-create-directory-row">
                        <TextInput
                            value={directory}
                            onChange={(event) => {
                                if (browseRequestRef.current) browseRequestRef.current.cancelled = true;
                                setDirectory(event.target.value);
                                setError("");
                            }}
                            placeholder="/path/to/behaviors"
                            spellCheck={false}
                        />
                        {isTauri() && (
                            <IconButton
                                className="submachine-create-browse"
                                onClick={browseDirectory}
                                disabled={isBrowsing || isSubmitting}
                                aria-label="Choose directory"
                                title="Choose directory"
                            >
                                <FiFolder aria-hidden="true" />
                            </IconButton>
                        )}
                    </div>
                </label>

                <label className="submachine-create-field">
                    <span>File name</span>
                    <TextInput
                        ref={nameInputRef}
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                        placeholder="MyBehavior.xml"
                        spellCheck={false}
                    />
                </label>

                {error && <div className="submachine-create-error" role="alert">{error}</div>}

                <div className="submachine-create-actions">
                    <Button onClick={cancel} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="primary" disabled={isSubmitting || isBrowsing}>
                        {isSubmitting ? "Creating…" : "Create"}
                    </Button>
                </div>
            </form>
        </CreationDialog>
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
