package de.unibi.citec.clf.bonsai.engine.config.fault

import de.unibi.citec.clf.bonsai.core.exception.StateIDException
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.StateID

/**
 * @author lruegeme
 */
class TransitionFault {
    /**
     * @author lruegeme
     */
    enum class TransitionErrorType {
        CONDITIONAL,
        MISSING,
        STATUS,
        SEND
    }

    @JvmField
    var id: StateID? = null
    private var condOnly = false
    var message: String
        private set
    @JvmField
    var type: TransitionErrorType
    private var estat: ExitStatus.Status? = null
    @JvmField
    var status: ExitStatus? = null
    @JvmField
    var event: String? = null

    constructor(stateID: String, event: String) {
        message = "State with id '$stateID' sending event '$event' that is not captured in transitions"
        condOnly = false
        try {
            id = StateID(stateID)
        } catch (e: StateIDException) {
            e.printStackTrace()
        }
        this.event = event
        type = TransitionErrorType.SEND
    }

    constructor(state: StateID, exitStatus: ExitStatus) {
        message =
            "State with id '${state.fullID}' misses transition for event '${state.canonicalSkill}.${exitStatus.fullStatus}'"
        condOnly = false
        id = state
        status = exitStatus
        type = TransitionErrorType.MISSING
    }

    constructor(state: StateID, exitStatus: ExitStatus, conditional: Boolean) {
        message =
            "State with id '${state.fullID}' has only conditional transitions for event '${state.canonicalSkill}.${exitStatus.fullStatus}"
        condOnly = conditional
        id = state
        status = exitStatus
        type = TransitionErrorType.CONDITIONAL
    }

    constructor(state: StateID, status: ExitStatus.Status) {
        estat = status
        message = "Skill " + state.fullSkill + " has ExitStatus " + status + " with and without ps "
        id = state
        type = TransitionErrorType.STATUS
    }

    companion object {
        private const val serialVersionUID = -2469432234699301337L
    }
}
