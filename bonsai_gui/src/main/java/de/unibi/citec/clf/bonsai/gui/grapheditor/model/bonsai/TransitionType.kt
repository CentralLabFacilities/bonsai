package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

enum class TransitionType {
    INBOUND,
    SUCCESS,
    ERROR,
    FATAL;

    companion object {
        fun getGeneralTransitionTypeFromString(transition: String): TransitionType {
            return when {
                transition.contains("success") -> SUCCESS
                transition.contains("error") -> ERROR
                transition.contains("fatal") -> FATAL
                else -> INBOUND
            }
        }
    }
}
