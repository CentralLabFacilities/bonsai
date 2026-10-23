package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.engine.communication.ROSServer;
import de.unibi.citec.clf.bonsai.engine.communication.ROSRuntimePublisher;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventBus;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import org.kohsuke.args4j.Option;
import org.ros.namespace.GraphName;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.logging.Level;
import java.util.logging.Logger;

/** ROS entry point for the state-machine controller. */
public class SCXMLStarterROS extends SCXMLStarter {
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
        RosFactory factory = new RosFactory();
        ROSServer server = new ROSServer(GraphName.of(serverTopic), null, topicStates);
        server.setController(stateMachineController);
        ROSRuntimePublisher publisher = new ROSRuntimePublisher(topicTransitions, topicStatus);

        try {
            factory.spawnRosNode(server, true);
        } catch (TimeoutException | ExecutionException | InterruptedException ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            Logger.getLogger(SCXMLStarterROS.class.getName()).log(Level.SEVERE, "Could not start ROS server", ex);
            throw new IllegalStateException("Could not start ROS server", ex);
        }

        SCXMLEventBus.addListener(publisher);
        // Publish the initial authoritative status, then ROS 1 latching retains it.
        publisher.publishStatus(stateMachineController.getStatus());
        LOG.info("ROS server started");
        return server;
    }

    public static void main(String[] args) {
        new SCXMLStarterROS().startup(args);
    }
}
