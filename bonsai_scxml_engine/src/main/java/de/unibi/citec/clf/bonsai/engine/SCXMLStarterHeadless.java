package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;

/**
 * Starts the state machine.
 *
 * @author lkettenb
 */
public class SCXMLStarterHeadless extends SCXMLStarter {

    public SCXMLStarterHeadless() {
    }

    @Override
    public SCXMLServer createServer() {
        return null;
    }

    /**
     * Starts the application.
     *
     * @param args Arguments
     */
    public static void main(String[] args) {
        List<String> strings = Arrays.asList(args);
        LinkedList<String> copy = new LinkedList<>(strings);
        if (!strings.contains("--headless")) {
            copy.add("--headless");
        }

        String[] argb = new String[copy.size()];
        argb = copy.toArray(argb);

        SCXMLStarterHeadless scxmlStarterHeadless = new SCXMLStarterHeadless();
        scxmlStarterHeadless.startup(argb);
    }

}
