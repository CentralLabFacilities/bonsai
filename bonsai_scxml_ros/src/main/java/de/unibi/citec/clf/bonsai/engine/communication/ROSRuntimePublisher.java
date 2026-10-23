package de.unibi.citec.clf.bonsai.engine.communication;

import bonsai_msgs.Transition;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

/** Publishes SCXML transitions and lifecycle status through two ROS topics. */
public class ROSRuntimePublisher extends SCXMLRuntimeEventAdapter {
    private final RuntimeNode node;

    private static class RuntimeNode extends RosNode {
        private final String transitionTopic;
        private final String statusTopic;
        private Publisher<Transition> transitionPublisher;
        private Publisher<std_msgs.String> statusPublisher;

        RuntimeNode(String transitionTopic, String statusTopic) {
            this.transitionTopic = transitionTopic;
            this.statusTopic = statusTopic;
        }

        @Override
        public void onStart(ConnectedNode connectedNode) {
            transitionPublisher = connectedNode.newPublisher(transitionTopic, Transition._TYPE);
            statusPublisher = connectedNode.newPublisher(statusTopic, std_msgs.String._TYPE);
            // A late ROS subscriber receives the most recently published status.
            statusPublisher.setLatchMode(true);
            initialized = true;
        }

        @Override
        public void destroyNode() {
            if (transitionPublisher != null) transitionPublisher.shutdown();
            if (statusPublisher != null) statusPublisher.shutdown();
        }

        @Override
        public GraphName getDefaultNodeName() {
            return GraphName.of("ROSRuntimePublisherNode");
        }
    }

    public ROSRuntimePublisher(String transitionTopic, String statusTopic) {
        node = new RuntimeNode(transitionTopic, statusTopic);
        try {
            new RosFactory().spawnRosNode(node, true);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while starting ROS runtime publisher", exception);
        } catch (TimeoutException | ExecutionException exception) {
            throw new IllegalStateException("Could not start ROS runtime publisher", exception);
        }
    }

    @Override
    public void publishStateChange(String from, String to, String event) {
        Transition message = node.transitionPublisher.newMessage();
        message.setEvent(event);
        message.setFrom(from);
        message.setTo(to);
        node.transitionPublisher.publish(message);
    }

    @Override
    public void publishStatus(StatemachineStatus status) {
        std_msgs.String message = node.statusPublisher.newMessage();
        message.setData(status.toString());
        node.statusPublisher.publish(message);
    }
}
