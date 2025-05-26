package de.unibi.citec.clf.bonsai.engine.communication;


import org.apache.commons.scxml2.SCXMLListener;
import org.apache.commons.scxml2.model.EnterableState;
import org.apache.commons.scxml2.model.Transition;
import org.apache.commons.scxml2.model.TransitionTarget;

/**
 * @author semeyerz
 */
public abstract class StateChangePublisher implements SCXMLListener {

    @Override
    public void onEntry(EnterableState tt) {

        if (tt.getId().equals("End") || tt.getId().equals("Error")
                || tt.getId().equals("Fatal")) {
            this.publish(tt.getId(), "", "");
        }
    }

    @Override
    public void onExit(EnterableState tt) {
    }

    @Override
    public void onTransition(TransitionTarget from, TransitionTarget to,
                             Transition transition, String event) {
        if (transition.getEvent() != null) {
            this.publish(from.getId(), to.getId(), transition.getEvent());
        }
    }

    public abstract void publish(String from, String to, String transition);
}
