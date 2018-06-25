package de.unibi.citec.clf.bonsai.engine.communication;


import bonsai_msgs.*;
import de.unibi.citec.clf.bonsai.core.configuration.XmlConfigurationParser;
import de.unibi.citec.clf.bonsai.engine.SCXMLDecoder;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import de.unibi.citec.clf.bonsai.ros.helper.ResponseFuture;
import nu.xom.ParsingException;
import org.ros.exception.ServiceNotFoundException;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.service.ServiceClient;
import org.xml.sax.SAXException;
import std_srvs.Empty;
import std_srvs.EmptyRequest;
import std_srvs.EmptyResponse;

import javax.xml.transform.TransformerException;
import java.io.File;
import java.io.IOException;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public class ROSController extends RosNode implements SCXMLRemote {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(ROSController.class);

    String topic;
    String serverTopic;
    private GraphName nodeName;

    ServiceClient<FireEventRequest, FireEventResponse> clientFireEvent;
    ServiceClient<LoadStatemachineRequest, LoadStatemachineResponse> clientLoad;
    ServiceClient<GetCurrentStatusRequest, GetCurrentStatusResponse> clientGetCurrent;
    ServiceClient<PauseStatemachineRequest, PauseStatemachineResponse> clientPaus;
    ServiceClient<SetParamsRequest, SetParamsResponse> clientSetParams;
    ServiceClient<StartStatemachineRequest, StartStatemachineResponse> clientStart;
    ServiceClient<DisableAutomaticTransitionsRequest, DisableAutomaticTransitionsResponse> clientStopEvents;
    ServiceClient<EmptyRequest, EmptyResponse> clientStop;

    public ROSController(GraphName gn, String serverTopic) {
        this.initialized = false;
        this.nodeName = gn;
        this.serverTopic = serverTopic;
    }

    @Override
    public List<String> getCurrentStates() {
        List<String> states = new LinkedList<>();
        final GetCurrentStatusRequest req = clientGetCurrent.newMessage();
        final ResponseFuture<GetCurrentStatusResponse> res = new ResponseFuture<>();
        clientGetCurrent.call(req, res);

        try {
            GetCurrentStatusResponse result = res.get();
            states = result.getCurrentStates();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return states;
    }

    @Override
    public boolean stopAutomaticEvents(boolean b) {
        final DisableAutomaticTransitionsRequest req = clientStopEvents.newMessage();
        final ResponseFuture<DisableAutomaticTransitionsResponse> res = new ResponseFuture<>();

        req.setEnableEvents(!b);

        clientStopEvents.call(req, res);

        try {
            res.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.warn(e);
        }
        return true;
    }

    @Override
    public void exit() {
        destroyNode();
    }

    @Override
    public List<String> getStateIds() {
        List<String> ids = new LinkedList<>();
        final GetCurrentStatusRequest req = clientGetCurrent.newMessage();
        final ResponseFuture<GetCurrentStatusResponse> res = new ResponseFuture<>();
        clientGetCurrent.call(req, res);

        try {
            GetCurrentStatusResponse result = res.get();
            ids = result.getIds();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return ids;
    }

    @Override
    public String load(String pathToConfig, String pathToTask, Map<String, String> includeMapping) {
        final LoadStatemachineRequest req = clientLoad.newMessage();

        try {
            logger.info("resolving config file... " + pathToConfig);
            String config = XmlConfigurationParser.transformXML(new File(pathToConfig)).toXML();
            logger.info("resolving scxml file...  " + pathToTask);
            String task = SCXMLDecoder.transformSCXML(new File(pathToTask), includeMapping);
            req.setConfig(config);
            req.setTask(task);
        } catch (IOException | TransformerException | SAXException | ParsingException ex) {
            logger.fatal(ex);
        }

        final ResponseFuture<LoadStatemachineResponse> res = new ResponseFuture<>();
        clientLoad.call(req, res);

        try {
            LoadStatemachineResponse result = res.get(10, TimeUnit.SECONDS);
            return result.getResp();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        } catch (TimeoutException ex) {
            logger.fatal("timeout calling load" + ex.getMessage());
        }

        return "unknown error";
    }

    @Override
    public boolean start() {
        return start("");
    }

    @Override
    public boolean setParams(Map<String, String> map) {
        final SetParamsRequest req = clientSetParams.newMessage();
        final ResponseFuture<SetParamsResponse> res = new ResponseFuture<>();

        List<String> keys = new LinkedList<>();
        List<String> values = new LinkedList<>();

        for (Map.Entry<String, String> e : map.entrySet()) {
            keys.add(e.getKey());
            values.add(e.getValue());
        }

        req.getParams().setKeys(keys);
        req.getParams().setValues(values);

        clientSetParams.call(req, res);

        try {
            SetParamsResponse result = res.get();
            return true;
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }

        return false;
    }

    @Override
    public boolean start(String state) {
        final StartStatemachineRequest req = clientStart.newMessage();
        final ResponseFuture<StartStatemachineResponse> res = new ResponseFuture<>();

        req.setStartState(state);

        clientStart.call(req, res);

        try {
            StartStatemachineResponse result = res.get();
            return result.getRunning();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return false;
    }

    @Override
    public boolean fireEvent(String event) {
        final FireEventRequest req = clientFireEvent.newMessage();
        final ResponseFuture<FireEventResponse> res = new ResponseFuture<>();

        req.setEvent(event);

        clientFireEvent.call(req, res);

        try {
            FireEventResponse result = res.get();
            return true;
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }

        return false;
    }

    @Override
    public List<String> getTransitions() {
        List<String> list = new LinkedList<>();
        final GetCurrentStatusRequest req = clientGetCurrent.newMessage();
        final ResponseFuture<GetCurrentStatusResponse> res = new ResponseFuture<>();
        clientGetCurrent.call(req, res);

        try {
            GetCurrentStatusResponse result = res.get();
            list = result.getTransitions();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return list;
    }

    @Override
    public boolean pause() {
        final PauseStatemachineRequest req = clientPaus.newMessage();
        final ResponseFuture<PauseStatemachineResponse> res = new ResponseFuture<>();

        req.setPause(true);

        clientPaus.call(req, res);

        try {
            PauseStatemachineResponse result = res.get();
            return result.getRunning();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return true;
    }

    @Override
    public boolean resume() {
        final PauseStatemachineRequest req = clientPaus.newMessage();
        final ResponseFuture<PauseStatemachineResponse> res = new ResponseFuture<>();

        req.setPause(false);

        clientPaus.call(req, res);

        try {
            PauseStatemachineResponse result = res.get();
            return result.getRunning();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return false;
    }

    @Override
    public boolean stop() {
        final EmptyRequest req = clientStop.newMessage();
        final ResponseFuture<EmptyResponse> res = new ResponseFuture<>();

        clientStop.call(req, res);

        try {
            EmptyResponse result = res.get();
            return true;
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal(ex);
        }
        return false;
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        try {
            clientFireEvent = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_FIRE_EVENT, FireEvent._TYPE);
            clientGetCurrent = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_GET_CURRENT, GetCurrentStatus._TYPE);
            clientLoad = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_LOAD, LoadStatemachine._TYPE);
            clientPaus = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_PAUSE, PauseStatemachine._TYPE);
            clientSetParams = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_SET_PARAMS, SetParams._TYPE);
            clientStart = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_START, StartStatemachine._TYPE);
            clientStopEvents = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_STOP_EVENTS, DisableAutomaticTransitions._TYPE);
            clientStop = connectedNode.newServiceClient(serverTopic + "/" + ROSServer.T_STOP, Empty._TYPE);
        } catch (ServiceNotFoundException ex) {
            logger.error(ex);
        }
        initialized = true;
    }

    @Override
    public void destroyNode() {
        clientFireEvent.shutdown();
        clientGetCurrent.shutdown();
        clientLoad.shutdown();
        clientPaus.shutdown();
        clientSetParams.shutdown();
        clientStart.shutdown();
        clientStopEvents.shutdown();
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

}
