package de.unibi.citec.clf.bonsai.ros2.actuators;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.ros2.Ros2Node;
import id.jros2client.JRos2Client;
import id.jrosclient.TopicSubmissionPublisher;
import id.jrosmessages.std_msgs.StringMessage;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class RosStringActuator extends Ros2Node implements StringActuator {

    String topic;
    private TopicSubmissionPublisher<StringMessage> publisher;
    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public RosStringActuator(JRos2Client client) {
        this.initialized = false;
        this.client = client;
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
            publisher.submit(new StringMessage().withData(data));
            logger.info("published " + data);
        }
    }

    @Override
    public void onStart() {
        publisher = new TopicSubmissionPublisher<>(StringMessage.class, topic);
        try {
            client.publish(publisher);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        initialized = true;
    }

    @Override
    public void cleanUp() throws IOException {
        client.unpublish(publisher);
        client.close();
    }
}
