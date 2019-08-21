package de.unibi.citec.clf.bonsai.ros.actuators;

import de.unibi.citec.clf.bonsai.actuators.SendDataActuator;
import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class RosSendData extends RosNode implements SendDataActuator {

    String rostype;
    String topic;
    private GraphName nodeName;
    private Publisher publisher;
    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public RosSendData(GraphName gn) {
        this.initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {
        this.topic = conf.requestValue("topic");
        this.rostype = conf.requestValue("rostype");
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
        publisher = connectedNode.newPublisher(topic, rostype);
        initialized = true;
    }

    @Override
    public void destroyNode() {
        if (publisher != null) publisher.shutdown();
    }

    @Override
    public void sendData(Type data) throws IOException {
        logger.trace("send " + data);
        logger.trace("type " + rostype);
        try {
            Object msg = MsgTypeFactory.getInstance().createMsg(data,rostype);
            logger.debug("publishing " + msg);
            publisher.publish(msg);
        } catch (RosSerializer.SerializationException e) {
            throw new IOException(e);
        }


    }
}
