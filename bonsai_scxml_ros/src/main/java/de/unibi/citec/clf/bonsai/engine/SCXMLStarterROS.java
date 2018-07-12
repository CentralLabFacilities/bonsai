package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.engine.communication.ROSServer;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisherROS;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import org.kohsuke.args4j.Option;
import org.ros.namespace.GraphName;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Starts the state machine.
 *
 * @author lkettenb
 */
public class SCXMLStarterROS extends SCXMLStarter {

    public SCXMLStarterROS() {
        super();
    }

    public static final String DEFAULT_TOPIC_TRANSITIONS = "/bonsai/transitions";
    public static final String DEFAULT_TOPIC_STATUS = "/bonsai/status";
    public static final String DEFAULT_TOPIC_STATES = "/bonsai/states";
    public static final String DEFAULT_SERVER_TOPIC = "/bonsai/server";


    @Option(name = "-s", aliases = {"--server_topic"}, metaVar = "VALUE", usage = "topic for ros server")
    private String serverTopic = DEFAULT_SERVER_TOPIC;

    @Option(name = "-tt", aliases = {"--transition_topic"}, metaVar = "VALUE", usage = "topic for transitions")
    private String topicTransitions = DEFAULT_TOPIC_TRANSITIONS;
    @Option(name = "-ti", aliases = {"--status_topic"}, metaVar = "VALUE", usage = "topic for status")
    private String topicStatus = DEFAULT_TOPIC_STATUS;
    @Option(name = "-ts", aliases = {"--states_topic"}, metaVar = "VALUE", usage = "topic for state list")
    private String topicStates = DEFAULT_TOPIC_STATES;

    @Override
    public SCXMLServer createServer() {

        RosFactory fac = new RosFactory();
        LOG.fatal("st: " + serverTopic);

        ROSServer srv = new ROSServer(GraphName.of(serverTopic), topicStatus, topicStates);
        srv.setController(stateMachineController);
        StateChangePublisher pub = new StateChangePublisherROS(topicTransitions);

        try {
            fac.spawnRosNode(srv, true);
        } catch (TimeoutException | ExecutionException | InterruptedException ex) {
            Logger.getLogger(SCXMLStarterROS.class.getName()).log(Level.SEVERE, null, ex);
        }

        LOG.info("Ros server started");

        skillStateMachine.addListener(pub);

        return srv;
    }

    /**
     * Starts the application.
     *
     * @param args Arguments
     */
    public static void main(String[] args) {
        SCXMLStarterROS scxmlStarterROS = new SCXMLStarterROS();
        scxmlStarterROS.startup(args);
    }


}
