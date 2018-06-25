package de.unibi.citec.clf.bonsai.ros.actuators;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class RosStringActuator extends RosNode implements StringActuator {

    String topic;
    private GraphName nodeName;
    private Publisher<std_msgs.String> publisher;
    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public RosStringActuator(GraphName gn) {
        this.initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {
        this.topic = conf.requestValue("topic");
    }

    @Override
    public String getTarget() {
        return topic;
    }

    @Override
    public void sendString(String data) throws IOException {
        if (publisher != null) {
            std_msgs.String str = publisher.newMessage();
            str.setData(data);
            publisher.publish(str);
            logger.info("published " + data);
        }

    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
        publisher = connectedNode.newPublisher(topic, std_msgs.String._TYPE);
        initialized = true;
        logger.fatal("on start, RosStringActuator done");
    }

    @Override
    public void destroyNode() {
        if (publisher != null) publisher.shutdown();
    }

}
