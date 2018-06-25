package de.unibi.citec.clf.bonsai.engine.scxml.config;

import de.unibi.citec.clf.bonsai.engine.model.StateID;

/**
 * @author lruegeme
 */
public class MissingSlotFault {

    private static final long serialVersionUID = 5250728310328591284L;
    private StateID state;
    private String slotKey;
    private boolean error = true;

    MissingSlotFault(String slotKey, StateID state) {
        this.slotKey = slotKey;
        this.state = state;
    }

    MissingSlotFault(String slotKey, StateID state, boolean error) {
        this.slotKey = slotKey;
        this.state = state;
        this.error = error;
    }

    public boolean isError() {
        return error;
    }

    public String getMessage() {
        if (error) {
            return "Missing slot definition with key \"" + slotKey + "\" for state \"" + state.getCanonicalID() + "\"";
        } else {
            return "Default slot definition with key \"" + slotKey + "\" for state \"" + state.getCanonicalID() + "\"" + " xpath is " + "\\" + slotKey;
        }
    }

    public StateID getState() {
        return state;
    }

    public String getSlotKey() {
        return slotKey;
    }

}
