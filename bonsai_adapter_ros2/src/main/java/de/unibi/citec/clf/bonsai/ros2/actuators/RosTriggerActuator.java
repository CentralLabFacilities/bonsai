//package de.unibi.citec.clf.bonsai.ros2.actuators;
//
//import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
//import de.unibi.citec.clf.bonsai.core.object.Actuator;
//import de.unibi.citec.clf.bonsai.ros2.Ros2Node;
//import de.unibi.citec.clf.bonsai.ros2.helper.TriggerFuture;
//import id.jros2client.JRos2Client;
//import pinorobotics.jros2services.JRos2ServiceClientFactory;
//
//import java.io.IOException;
//import java.util.concurrent.Future;
//
///**
// * @author lruegeme
// */
//public class RosTriggerActuator extends Ros2Node implements Actuator {
//
//    String server;
//    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());
//
//    ServiceClient<TriggerRequest, TriggerResponse> clientTrigger;
//
//    public RosTriggerActuator(JRos2Client client) {
//        this.initialized = false;
//        this.client = client;
//    }
//
//    @Override
//    public void configure(IObjectConfigurator conf) {
//        this.server = conf.requestValue("server");
//    }
//
//    @Override
//    public void onStart() {
//        var serviceClientFactory = new JRos2ServiceClientFactory();
//        serviceClientFactory.createClient(client, new AddTwo)
//    }
//
//    @Override
//    public void cleanUp() throws IOException {
//
//    }
//
//    @Override
//    public void onStart(final ConnectedNode connectedNode) {
//        logger.fatal("on start, RosGuidingActuator done");
//        try {
//            clientTrigger = connectedNode.newServiceClient(server, Trigger._TYPE);
//        } catch (ServiceNotFoundException e) {
//            throw new RosRuntimeException(e);
//        }
//        initialized = true;
//    }
//
//    @Override
//    public void destroyNode() {
//        if (clientTrigger != null) clientTrigger.shutdown();
//    }
//
//    public Future<Boolean> trigger() {
//        final TriggerRequest req = clientTrigger.newMessage();
//
//        //Set data
//        final TriggerFuture res = new TriggerFuture();
//        clientTrigger.call(req, res);
//
//        //return if trigger succeeded
//        return res;
//    }
//
//}
