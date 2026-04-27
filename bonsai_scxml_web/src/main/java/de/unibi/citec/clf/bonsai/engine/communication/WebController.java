package de.unibi.citec.clf.bonsai.engine.communication;


import java.util.List;
import java.util.Map;

/**
 * @author lruegeme
 */
public class WebController implements SCXMLRemote {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(WebController.class);


    @Override
    public boolean fireEvent(String event) {
        return false;
    }

    @Override
    public List<String> getCurrentStates() {
        return List.of();
    }

    @Override
    public List<String> getStateIds() {
        return List.of();
    }

    @Override
    public List<String> getTransitions() {
        return List.of();
    }

    @Override
    public String load(String pathToConfig, String pathToTask, Map<String, String> includeMapping, boolean forceConfigure) {
        return "";
    }

    public String load(String configXML, String taskXML, boolean forceConfigure) {
        // Save file locally and then call load PATH
        return "";
    }

    @Override
    public boolean pause() {
        return false;
    }

    @Override
    public boolean resume() {
        return false;
    }

    @Override
    public boolean setParams(Map<String, String> map) {
        return false;
    }

    @Override
    public boolean start() {
        return false;
    }

    @Override
    public boolean start(String state) {
        return false;
    }

    @Override
    public boolean stop() {
        return false;
    }

    @Override
    public boolean stopAutomaticEvents(boolean b) {
        return false;
    }

    @Override
    public void exit() {

    }
}
