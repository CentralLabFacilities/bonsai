package de.unibi.citec.clf.bonsai.engine.communication;


import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition;

import java.util.List;

/**
 * @author lruegeme
 */
public interface SCXMLServer {

    public boolean sendStatesWithTransitions();

    public void sendCurrentStates(List<String> states);

    public void sendCurrentStatesAndTransitions(List<String> states, List<BonsaiTransition> transitions);

    public void sendStatus(String status);

}
