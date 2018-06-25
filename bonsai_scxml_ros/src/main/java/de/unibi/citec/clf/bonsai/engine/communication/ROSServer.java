package de.unibi.citec.clf.bonsai.engine.communication;


import bonsai_msgs.*;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import org.apache.log4j.Logger;
import org.ros.exception.ServiceException;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.service.ServiceResponseBuilder;
import org.ros.node.service.ServiceServer;
import std_srvs.Empty;
import std_srvs.EmptyRequest;
import std_srvs.EmptyResponse;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class ROSServer extends ROSMinimalServer implements SCXMLServerWithControl {

    public static final String T_FIRE_EVENT = "fireEvent";
    public static final String T_GET_CURRENT = "getStatus";
    public static final String T_LOAD = "load";
    public static final String T_PAUSE = "pause";
    public static final String T_SET_PARAMS = "setParams";
    public static final String T_START = "start";
    public static final String T_STOP = "stop";
    public static final String T_STOP_EVENTS = "disableEvents";

    private static Logger logger = Logger.getLogger(ROSServer.class);
    private StateMachineController smc;

    private List<ServiceServer> server = new LinkedList<>();

    String topic;
    private GraphName nodeName;

    public ROSServer(GraphName gn, String topicStatus, String topicCurrentStates) {
        super(gn,topicStatus,topicCurrentStates);
        this.initialized = false;
        this.nodeName = gn;

        topic = gn.toString();
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        super.onStart(connectedNode);
        initialized = false;

        ServiceServer s;

        s = connectedNode.newServiceServer(topic + "/" + T_FIRE_EVENT, FireEvent._TYPE, new FireEventCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_GET_CURRENT, GetCurrentStatus._TYPE, new GetStatusCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_LOAD, LoadStatemachine._TYPE, new LoadCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_PAUSE, PauseStatemachine._TYPE, new PauseCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_SET_PARAMS, SetParams._TYPE, new SetParamsCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_START, StartStatemachine._TYPE, new StartCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_STOP, Empty._TYPE, new StopCallback());
        server.add(s);
        s = connectedNode.newServiceServer(topic + "/" + T_STOP_EVENTS, DisableAutomaticTransitions._TYPE, new StopEventsCallback());
        server.add(s);

        initialized = true;
    }

    @Override
    public void destroyNode() {
        super.destroyNode();
        server.forEach(s -> {
            try {
                s.shutdown();
            } catch (Exception e) {
                logger.warn(e);
            }
        });
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void setController(StateMachineController controller) {
        smc = controller;
    }

    @Override
    public void shutdown() {
        destroyNode();
    }

    private class FireEventCallback implements ServiceResponseBuilder<FireEventRequest, FireEventResponse> {

        @Override
        public void build(FireEventRequest t, FireEventResponse s) throws ServiceException {
            String ev = t.getEvent();
            logger.debug("FireEventCallback: " + ev);
            if (!ev.isEmpty()) {
                smc.fireEvent(ev);
                //s.true
            } else {
                //s.false
            }

        }
    }

    private class GetStatusCallback implements ServiceResponseBuilder<GetCurrentStatusRequest, GetCurrentStatusResponse> {

        @Override
        public void build(GetCurrentStatusRequest t, GetCurrentStatusResponse s) throws ServiceException {
            s.setCurrentStates(new LinkedList<>(smc.getCurrentStateList()));
            s.setIds(new LinkedList<>(smc.getAllStateIds()));
            List<String> transitions = new LinkedList<>();
            smc.getPossibleTransitions().forEach((trans) -> transitions.add(trans.getEvent()));
            s.setTransitions(transitions);
        }
    }

    private class LoadCallback implements ServiceResponseBuilder<LoadStatemachineRequest, LoadStatemachineResponse> {

        @Override
        public void build(LoadStatemachineRequest t, LoadStatemachineResponse s) throws ServiceException {
            if(t.getIsPath()){
                smc.setConfigPath(t.getConfig());
                smc.setTaskPath(t.getTask());
                s.setResp(smc.load().toString());
            }else{
                String cfgPath = saveFile("/tmp/config", t.getConfig());
                String taskPath = saveFile("/tmp/task", t.getTask());
                smc.setConfigPath(cfgPath);
                smc.setTaskPath(taskPath);
                s.setResp(smc.load().toString());
                try {
                    Files.delete(Paths.get(cfgPath));
                    Files.delete(Paths.get(taskPath));
                } catch (IOException ex) {
                    logger.debug(ex);
                }
            }
        }
    }

    private class PauseCallback implements ServiceResponseBuilder<PauseStatemachineRequest, PauseStatemachineResponse> {

        @Override
        public void build(PauseStatemachineRequest t, PauseStatemachineResponse s) throws ServiceException {
            boolean paused = t.getPause();
            if (paused) {
                smc.pauseStateMachine();
            } else {
                smc.continueStateMachine();
            }
            s.setRunning(!paused);
        }
    }

    private class SetParamsCallback implements ServiceResponseBuilder<SetParamsRequest, SetParamsResponse> {

        @Override
        public void build(SetParamsRequest t, SetParamsResponse s) throws ServiceException {
            HashMap<String, String> params = new HashMap<>();

            if (t.getParams().getKeys().size() != t.getParams().getValues().size()) {
                logger.fatal("key/value length missmatch");
                return;
            }

            for (int i = 0; i < t.getParams().getKeys().size(); i++) {
                params.put(t.getParams().getKeys().get(i), t.getParams().getValues().get(i));
            }

            smc.setDatamodelParams(params);

        }
    }

    private class StartCallback implements ServiceResponseBuilder<StartStatemachineRequest, StartStatemachineResponse> {

        @Override
        public void build(StartStatemachineRequest t, StartStatemachineResponse s) throws ServiceException {
            logger.trace("start callback called");

            smc.executeStateMachine(t.getStartState());

            s.setRunning(true);
        }
    }

    private class StopCallback implements ServiceResponseBuilder<EmptyRequest, EmptyResponse> {

        @Override
        public void build(EmptyRequest t, EmptyResponse s) throws ServiceException {
            logger.trace("stop callback called");

            smc.stopStateMachine();
        }
    }


    private class StopEventsCallback implements ServiceResponseBuilder<DisableAutomaticTransitionsRequest, DisableAutomaticTransitionsResponse> {

        @Override
        public void build(DisableAutomaticTransitionsRequest t, DisableAutomaticTransitionsResponse s) throws ServiceException {
            smc.enableAutomaticEvents(t.getEnableEvents());
        }
    }

    private String saveFile(String name, String data) {
        File file;

        try {

            file = new File(name);
            try (FileOutputStream fop = new FileOutputStream(file)) {
                // if file doesnt exists, then create it
                if (!file.exists()) {
                    file.createNewFile();
                }

                // get the content in bytes
                byte[] contentInBytes = data.getBytes();

                fop.write(contentInBytes);
            }

            logger.debug("written:" + file.getAbsolutePath());

            return file.getAbsolutePath();

        } catch (IOException e) {
            logger.warn(e);
        }

        return "";
    }
}
