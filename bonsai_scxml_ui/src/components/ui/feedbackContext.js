import { createContext, useContext } from "react";

export const FeedbackContext = createContext(null);

export function useFeedback() {
    const feedback = useContext(FeedbackContext);
    if (!feedback) {
        throw new Error("useFeedback must be used inside FeedbackProvider.");
    }
    return feedback;
}
