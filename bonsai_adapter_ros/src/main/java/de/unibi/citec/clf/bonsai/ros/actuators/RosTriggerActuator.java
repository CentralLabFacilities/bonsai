package de.unibi.citec.clf.bonsai.ros.actuators;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import de.unibi.citec.clf.bonsai.ros.helper.TriggerFuture;
import org.ros.exception.RosRuntimeException;
import org.ros.exception.ServiceNotFoundException;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.service.ServiceClient;
import std_srvs.Trigger;
import std_srvs.TriggerRequest;
import std_srvs.TriggerResponse;

import java.util.concurrent.Future;

/**
 * @author lruegeme
 */
public class RosTriggerActuator extends RosNode implements Actuator {

    String server;
    private GraphName nodeName;
    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    ServiceClient<TriggerRequest, TriggerResponse> clientTrigger;

    public RosTriggerActuator(GraphName gn) {
        initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {
        this.server = conf.requestValue("server");
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
        logger.fatal("on start, RosGuidingActuator done");
        try {
            clientTrigger = connectedNode.newServiceClient(server, Trigger._TYPE);
        } catch (ServiceNotFoundException e) {
            throw new RosRuntimeException(e);
        }
        initialized = true;
    }

    @Override
    public void destroyNode() {
        if (clientTrigger != null) clientTrigger.shutdown();
    }

    public Future<Boolean> trigger() {
        final TriggerRequest req = clientTrigger.newMessage();

        //Set data
        final TriggerFuture res = new TriggerFuture();
        clientTrigger.call(req, res);

        //return if trigger succeeded
        return res;
    }

}
