package de.unibi.citec.clf.bonsai.engine.communication.web;


import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServerWithControl;
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition;
import org.apache.log4j.Logger;

import java.util.List;

/**
 * @author lruegeme
 */
public class WebServer implements SCXMLServerWithControl {

    private StateMachineController smc;
    private static final Logger logger = Logger.getLogger(WebServer.class);

    @Override
    public void setController(StateMachineController stateMachineController) {
        this.smc = stateMachineController;
    }

    @Override
    public void shutdown() {
        logger.info("Shutting down WebServer");
    }

    @Override
    public boolean sendStatesWithTransitions() {
        return true;
    }

    @Override
    public void sendCurrentStates(List<String> states) {
        logger.debug("Sending current states");
    }

    @Override
    public void sendCurrentStatesAndTransitions(List<String> states, List<BonsaiTransition> transitions) {
        logger.debug("Sending current states and transitions");
    }

    @Override
    public void sendStatus(StatemachineStatus status) {
        logger.debug("Sending current status");
    }
}
