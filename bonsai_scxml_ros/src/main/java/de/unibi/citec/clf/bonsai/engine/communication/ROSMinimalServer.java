package de.unibi.citec.clf.bonsai.engine.communication;


import bonsai_msgs.StateList;
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import org.apache.log4j.Logger;
import org.ros.message.MessageFactory;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.service.ServiceServer;
import org.ros.node.topic.Publisher;

import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class ROSMinimalServer extends RosNode implements SCXMLServer {

    private static Logger logger = Logger.getLogger(ROSMinimalServer.class);

    private List<ServiceServer> server = new LinkedList<>();

    String topicCurrentStates;
    String topicStatus;
    private GraphName nodeName;
    private boolean withTransitions = true;
    private MessageFactory messageFactory;

    private Publisher<bonsai_msgs.StateList> stateListPublisher;
    private Publisher<std_msgs.String> statusPublisher;

    public ROSMinimalServer(GraphName gn, String topicStatus, String topicCurrentStates, boolean statesWithTransitions) {
        this.initialized = false;
        this.nodeName = gn;

        this.topicStatus = topicStatus;
        this.topicCurrentStates = topicCurrentStates;
    }

    public ROSMinimalServer(GraphName gn, String topicStatus, String topicCurrentStates) {
        this(gn, topicStatus, topicCurrentStates, true);
    }

    @Override
    public boolean sendStatesWithTransitions() {
        return withTransitions;
    }

    @Override
    public void sendCurrentStates(List<String> states) {
        sendCurrentStatesAndTransitions(states, new LinkedList<>());
    }

    @Override
    public void sendCurrentStatesAndTransitions(List<String> states, List<BonsaiTransition> transitions) {

        final StateList stateList = stateListPublisher.newMessage();
        stateList.setStates(states);

        List<bonsai_msgs.Transition> trans = new LinkedList<>();
        for (BonsaiTransition t : transitions) {
            bonsai_msgs.Transition msg = messageFactory.newFromType(bonsai_msgs.Transition._TYPE);
            msg.setTo(t.getTo());
            msg.setEvent(t.getEvent());
            msg.setFrom(t.getFrom());
            trans.add(msg);
        }
        stateList.setTransitions(trans);

        stateListPublisher.publish(stateList);
    }

    @Override
    public void sendStatus(String status) {
        std_msgs.String string = statusPublisher.newMessage();
        string.setData(status);
        statusPublisher.publish(string);
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        stateListPublisher = connectedNode.newPublisher(topicCurrentStates, StateList._TYPE);
        statusPublisher = connectedNode.newPublisher(topicStatus, std_msgs.String._TYPE);
        messageFactory = connectedNode.getTopicMessageFactory();
        initialized = true;
    }

    @Override
    public void destroyNode() {
        stateListPublisher.shutdown();
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

}
