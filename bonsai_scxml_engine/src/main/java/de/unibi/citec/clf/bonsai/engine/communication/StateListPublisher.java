package de.unibi.citec.clf.bonsai.engine.communication;


import java.util.List;

public interface StateListPublisher {

    void onStateChange(List<String> states, List<String> transitions);

}
