package de.unibi.citec.clf.bonsai.engine.communication;


import org.apache.commons.scxml.SCXMLListener;
import org.apache.commons.scxml.model.Transition;
import org.apache.commons.scxml.model.TransitionTarget;

/**
 * @author semeyerz
 */
public abstract class StateChangePublisher implements SCXMLListener {

    @Override
    public void onEntry(TransitionTarget tt) {

        if (tt.getId().equals("End") || tt.getId().equals("Error")
                || tt.getId().equals("Fatal")) {
            this.publish(tt.getId(), "", "");
        }
    }

    @Override
    public void onExit(TransitionTarget tt) {
    }

    @Override
    public void onTransition(final TransitionTarget from,
                             final TransitionTarget to, final Transition transition) {
        if (transition.getEvent() != null) {
            this.publish(from.getId(), to.getId(), transition.getEvent());
        }
    }

    public abstract void publish(String from, String to, String transition);
}
