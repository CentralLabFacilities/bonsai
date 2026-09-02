import { useRef } from "react";
import { FiFolder, FiSave, FiDownload } from "react-icons/fi";
import { isTauri } from "../tauri-client.js";

function Header({ onImportFile, onSaveFile, onSaveAsFile, hasFilePath }) {
    const fileInputRef = useRef(null);
    const IS_DESKTOP = isTauri();

    return (
        <header className="header">
            <div className="header-left">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={onImportFile}
                    accept=".scxml,.xml"
                    style={{ display: "none" }}
                />

                {/* Open button - different for desktop vs browser */}
                <button
                    className="menu-button"
                    onClick={async () => {
                        if (IS_DESKTOP) {
                            await onImportFile({ fromDesktop: true });
                        } else {
                            try {
                                if ("showOpenFilePicker" in window) {
                                    const [handle] = await window.showOpenFilePicker({
                                        types: [{ description: "XML/SCXML", accept: { "application/xml": [".xml", ".scxml"] } }],
                                    });
                                    const file = await handle.getFile();
                                    onImportFile({ target: { files: [file] }, fileHandle: handle });
                                } else {
                                    fileInputRef.current && fileInputRef.current.click();
                                }
                            } catch (err) {
                                if (err.name !== "AbortError") fileInputRef.current && fileInputRef.current.click();
                            }       
                        }
                    }}
                >
                    <FiFolder />
                    <span>Open</span>
                </button>

                {/* Save button - direct save when file is open */}
                {IS_DESKTOP && hasFilePath ? (
                    <button className="menu-button highlight-save-button" onClick={onSaveFile}>
                        <FiSave />
                        <span>Save</span>
                    </button>
                ) : null}

                {/* Save As button - always available */}
                {IS_DESKTOP ? (
                    <button className="menu-button highlight-save-button" onClick={onSaveAsFile}>
                        <FiDownload />
                        <span>Save as..</span>
                    </button>
                ) : (
                    <button className="menu-button highlight-save-button" onClick={onSaveFile}>
                        <FiSave />
                        <span>Save</span>
                    </button>
                )}

                <h2>Bonsai UI</h2>
            </div>
        </header>
    );
}

export default Header;
