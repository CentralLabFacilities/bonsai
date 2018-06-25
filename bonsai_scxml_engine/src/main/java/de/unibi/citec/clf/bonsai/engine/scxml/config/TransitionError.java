package de.unibi.citec.clf.bonsai.engine.scxml.config;

import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.StateID;

/**
 * @author lruegeme
 */
public class TransitionError {

    /**
     * @author lruegeme
     */
    public enum TransitionErrorType {
        CONDITIONAL, MISSING, STATUS, SEND
    }

    private static final long serialVersionUID = -2469432234699301337L;
    public StateID id;
    private boolean condOnly;
    private String message;
    public TransitionErrorType type;
    private ExitStatus.Status estat;
    public ExitStatus status;
    public String event;

    public TransitionError(String stateID, String event) {
        message = "State with id \"" + stateID + "\" sending event \"" + event + "\" that is not captured in transitions";
        condOnly = false;
        try {
            id = new StateID(stateID);
        } catch (StateIDException e) {
            e.printStackTrace();
        }
        this.event = event;
        type = TransitionErrorType.SEND;
    }

    public TransitionError(StateID state, ExitStatus exitStatus) {
        message = "State with id \"" + state.getFullID() + "\" misses transition for event \"" + state.getCanonicalSkill() + "." + exitStatus.getFullStatus() + "\"";
        condOnly = false;
        id = state;
        status = exitStatus;
        type = TransitionErrorType.MISSING;
    }

    public TransitionError(StateID state, ExitStatus exitStatus, boolean conditional) {
        message = "State with id \"" + state.getFullID() + "\" has only conditional transitions for event \"" + state.getCanonicalSkill() + "." + exitStatus.getFullStatus();
        condOnly = true;
        id = state;
        status = exitStatus;
        type = TransitionErrorType.CONDITIONAL;
    }

    public TransitionError(StateID state, ExitStatus.Status status) {
        estat = status;
        message = "Skill " + state.getFullSkill() + " has ExitStatus " + status + " with and without ps ";
        id = state;
        type = TransitionErrorType.STATUS;
    }

    public String getMessage() {
        return message;
    }


}
