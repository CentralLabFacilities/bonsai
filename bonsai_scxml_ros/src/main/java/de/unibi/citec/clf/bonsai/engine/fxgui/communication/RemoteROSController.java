package de.unibi.citec.clf.bonsai.engine.fxgui.communication;


import bonsai_msgs.StateList;
import bonsai_msgs.Transition;
import de.unibi.citec.clf.bonsai.engine.SCXMLStarterROS;
import de.unibi.citec.clf.bonsai.engine.communication.ROSController;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Subscriber;

import java.util.LinkedList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * @author lruegeme
 */
public class RemoteROSController extends ROSController implements FXGUISCXMLRemote, MessageListener<StateList> {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(RemoteROSController.class);

    private SimpleStringProperty status;
    private boolean running = true;

    private Subscriber<bonsai_msgs.StateList> subscriber;
    private ICurrentStateListener listener;

    public RemoteROSController(GraphName gn, String serverTopic) {
        super(gn, serverTopic);
        status = new SimpleStringProperty();

    }

    @Override
    public StringProperty getStatusProp() {
        return status;
    }

    @Override
    public void onStart(ConnectedNode connectedNode) {
        subscriber = connectedNode.newSubscriber(SCXMLStarterROS.DEFAULT_TOPIC_STATES, bonsai_msgs.StateList._TYPE);
        //todo config
        logger.warn("using defaut states topic " + SCXMLStarterROS.DEFAULT_TOPIC_STATES);

        subscriber.addMessageListener(this);
        super.onStart(connectedNode);
    }

    @Override
    public void addStateTrigger(IStateListener list) {
        RemoteROSController r = this;
        Task task = new Task<Void>() {

            List<String> old = new LinkedList<>();

            @Override
            protected Void call() throws Exception {
                while (running) {
                    List<String> ids = r.getStateIds();

                    if (ids != null && changed(ids, old)) {
                        ObservableList o = FXCollections.observableArrayList();
                        o.addAll(ids);
                        list.setStateList(o);
                        old = ids;
                    }
                    Thread.sleep(500);
                }
                return null;
            }

            private boolean changed(List<String> evs, List<String> ev) {
                return (evs.size() != ev.size() ||
                        !evs.containsAll(ev)
                );
            }

        };

        new Thread(task).start();
    }

    @Override
    public void addCurrentStateTrigger(ICurrentStateListener list) {

        listener = list;

    }

    @Override
    public void onNewMessage(StateList stateList) {

        List<String> ids = stateList.getStates();
        List<String> ev = stateList.getTransitions().stream().map(Transition::getEvent).collect(Collectors.toCollection(LinkedList::new));

        ObservableList o = FXCollections.observableArrayList();
        o.addAll(ids);
        if (listener != null) listener.updateStateList(o);

        o = FXCollections.observableArrayList();
        o.addAll(ev);
        if (listener != null) listener.updateEventList(o);

    }
}
