package de.unibi.citec.clf.bonsai.gui.grapheditor.model.exceptions

class IllegalBonsaiTypeUsageException: Exception {

    constructor() : super()

    constructor(e: Throwable) : super(e)

    constructor(msg: String, e: Throwable) : super(msg, e)

    constructor(msg: String) : super(msg)
}
