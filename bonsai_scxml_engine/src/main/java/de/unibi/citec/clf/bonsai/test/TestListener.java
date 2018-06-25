package de.unibi.citec.clf.bonsai.test;

import org.apache.commons.scxml.SCXMLListener;
import org.apache.commons.scxml.model.Transition;
import org.apache.commons.scxml.model.TransitionTarget;
import org.apache.log4j.Logger;

import java.util.concurrent.TimeoutException;

public class TestListener implements SCXMLListener {

    private static Logger logger = Logger.getLogger(TestListener.class);

    private TestListener() {
    }

    private enum State {
        running, success, failure
    }

    private State state = State.running;
    private String successState = null;
    private String failureState = null;

    private String successTransition = null;

    public boolean waitForStatus() throws TimeoutException {
        return waitForStatus(9000);
    }

    public boolean waitForStatus(long timeout) throws TimeoutException {
        final long endtimeout = timeout + System.currentTimeMillis();
        while (state == State.running) {
            Thread.yield();
            if (System.currentTimeMillis() > endtimeout) {
                throw new TimeoutException("Statemachine took too long");
            }
        }
        return state == State.success;
    }

    private void setEndState(String state) {
        successState = state;
    }

    public static TestListener newSuccessState(String state, String fail) {
        final TestListener testListener = new TestListener();
        testListener.successState = state;
        testListener.failureState = fail;
        return testListener;
    }

    public static TestListener newSuccessEvent(String trans, String fail) {
        final TestListener testListener = new TestListener();
        testListener.successTransition = trans;
        testListener.failureState = fail;
        return testListener;
    }

    public static TestListener newEndFatal() {
        final TestListener testListener = new TestListener();
        testListener.successState = "End";
        testListener.failureState = "Fatal";
        return testListener;
    }

    @Override
    public void onEntry(TransitionTarget state) {
        if (this.state != State.running) return;

        if (state.getId().equals(successState)) this.state = State.success;
        if (state.getId().equals(failureState)) this.state = State.failure;
    }

    @Override
    public void onExit(TransitionTarget state) {

    }

    @Override
    public void onTransition(TransitionTarget from, TransitionTarget to, Transition transition) {
        if (this.state != State.running) return;

        if (successTransition != null) {
            if (transition != null && transition.getEvent().equals(successTransition)) {
                state = State.success;
            }
        }

    }


}
