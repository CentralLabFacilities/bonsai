package de.unibi.citec.clf.bonsai.engine.communication;


import bonsai_msgs.Transition;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import org.apache.log4j.Logger;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;


/**
 * @author semeyerz
 */
public class StateChangePublisherROS extends StateChangePublisher {

    private static final Logger LOG = Logger.getLogger(StateChangePublisherROS.class);

    private class StateChangeNode extends RosNode {

        private String topic;
        private Publisher<Transition> pub;

        public StateChangeNode(String topic) {
            this.topic = topic;
        }

        @Override
        public void onStart(ConnectedNode connectedNode) {
            pub = connectedNode.newPublisher(topic, Transition._TYPE);
        }

        @Override
        public void destroyNode() {
            pub.shutdown();
        }

        @Override
        public GraphName getDefaultNodeName() {
            return GraphName.of("StateChangePublisherRosNode");
        }
    }

    StateChangeNode node;

    public StateChangePublisherROS(String scope) {
        node = new StateChangeNode(scope);
        try {
            new RosFactory().spawnRosNode(node, true);
        } catch (TimeoutException | ExecutionException | InterruptedException e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    @Override
    public void publish(String from, String to, String transition) {
        final Transition trans = node.pub.newMessage();
        trans.setEvent(transition);
        trans.setFrom(from);
        trans.setTo(to);
        node.pub.publish(trans);
    }

}
