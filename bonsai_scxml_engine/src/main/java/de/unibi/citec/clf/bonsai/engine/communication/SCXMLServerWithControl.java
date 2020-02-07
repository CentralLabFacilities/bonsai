package de.unibi.citec.clf.bonsai.engine.communication;


import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;

/**
 * @author lruegeme
 */
public interface SCXMLServerWithControl extends SCXMLServer{

    public void setController(StateMachineController stateMachineController);

    public void shutdown();

}
