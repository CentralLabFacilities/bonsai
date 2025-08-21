package de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai

class ExitStatus(var status: Status, var statusSuffix: String = "") {
    enum class Status() {
        SUCCESS,
        ERROR,
        FATAL
    }
}

