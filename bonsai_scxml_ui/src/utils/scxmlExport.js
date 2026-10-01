const backendOnly = () => {
    throw new Error(
        "SCXML serialization requires the Rust/Tauri semantic backend. Browser mode is UI-only."
    );
};

export const generateXmlString = backendOnly;
export const saveScxmlFile = backendOnly;
