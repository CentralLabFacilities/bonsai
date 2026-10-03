import { useEffect, useState } from "react";
import {
    loadBehaviorDirectories,
    loadEdgeVisibility,
    saveEditorPreferences,
} from "../utils/editorPreferences.js";

export function useEditorPreferences() {
    const [behaviorDirectories, setBehaviorDirectories] = useState(loadBehaviorDirectories);
    const [showTransitionEdges, setShowTransitionEdges] = useState(() => loadEdgeVisibility("transitions"));
    const [showSlotEdges, setShowSlotEdges] = useState(() => loadEdgeVisibility("slots"));

    useEffect(() => {
        saveEditorPreferences({ behaviorDirectories, showTransitionEdges, showSlotEdges });
    }, [behaviorDirectories, showTransitionEdges, showSlotEdges]);

    return {
        behaviorDirectories,
        setBehaviorDirectories,
        showTransitionEdges,
        setShowTransitionEdges,
        showSlotEdges,
        setShowSlotEdges,
    };
}
