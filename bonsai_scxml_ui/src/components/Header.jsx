import { FiFolder, FiSave, FiDownload } from "react-icons/fi";
import { isTauri } from "../tauri-client.js";

function Header({
    onOpenFile,
    onSaveFile,
    onSaveAsFile,
    hasFilePath,
    isSaving = false,
}) {
    const IS_DESKTOP = isTauri();

    return (
        <header className="header">
            <div className="header-left">
                <button
                    className="menu-button"
                    onClick={() => void onOpenFile?.()}
                    disabled={isSaving}
                >
                    <FiFolder />
                    <span>Open</span>
                </button>

                {/* Save button - direct save when a desktop path is known. */}
                {IS_DESKTOP && hasFilePath ? (
                    <button
                        className="menu-button highlight-save-button"
                        onClick={() => void onSaveFile?.()}
                        disabled={isSaving}
                    >
                        <FiSave />
                        <span>{isSaving ? "Saving…" : "Save"}</span>
                    </button>
                ) : null}

                {/* Save As is always available on desktop. Browser Save chooses
                    the existing file handle when one is available. */}
                {IS_DESKTOP ? (
                    <button
                        className="menu-button highlight-save-button"
                        onClick={() => void onSaveAsFile?.()}
                        disabled={isSaving}
                    >
                        <FiDownload />
                        <span>Save as..</span>
                    </button>
                ) : (
                    <button
                        className="menu-button highlight-save-button"
                        onClick={() => void onSaveFile?.()}
                        disabled={isSaving}
                    >
                        <FiSave />
                        <span>{isSaving ? "Saving…" : "Save"}</span>
                    </button>
                )}

                <h2>Bonsai UI</h2>
            </div>
        </header>
    );
}

export default Header;
