package de.unibi.citec.clf.bonsai.engine.communication;

import java.util.List;
import java.util.Map;

/**
 * @author lruegeme
 */
public interface SCXMLRemote {

    boolean fireEvent(String event);

    List<String> getCurrentStates();

    List<String> getStateIds();

    List<String> getTransitions();

    String load(String pathToConfig, String pathToTask, Map<String, String> includeMapping);

    boolean pause();

    boolean resume();

    boolean setParams(Map<String, String> map);

    boolean start();

    boolean start(String state);

    boolean stop();

    boolean stopAutomaticEvents(boolean b);

    //Stop the remote
    void exit();
}
