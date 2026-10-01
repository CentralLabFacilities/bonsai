const backendOnly = (operation) => {
    throw new Error(
        `${operation} requires the Rust/Tauri semantic backend. Browser mode is UI-only.`
    );
};

export const getAncestorSlotSourcesByPath = () =>
    backendOnly("Slot ancestry analysis");

export const buildEditorProblems = () =>
    backendOnly("Workflow validation");
