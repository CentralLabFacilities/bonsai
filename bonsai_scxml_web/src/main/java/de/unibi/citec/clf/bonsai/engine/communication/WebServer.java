package de.unibi.citec.clf.bonsai.engine.communication;


import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition;

import java.util.List;

/**
 * @author lruegeme
 */
public class WebServer implements SCXMLServerWithControl {


    @Override
    public void setController(StateMachineController stateMachineController) {

    }

    @Override
    public void shutdown() {

    }

    @Override
    public boolean sendStatesWithTransitions() {
        return false;
    }

    @Override
    public void sendCurrentStates(List<String> states) {

    }

    @Override
    public void sendCurrentStatesAndTransitions(List<String> states, List<BonsaiTransition> transitions) {

    }

    @Override
    public void sendStatus(StatemachineStatus status) {

    }
}
