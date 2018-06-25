package de.unibi.citec.clf.bonsai.engine.fxgui.communication;


import de.unibi.citec.clf.bonsai.engine.communication.ROSController;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import org.ros.namespace.GraphName;

import java.util.LinkedList;
import java.util.List;

/**
 * @author lruegeme
 */
public class RemoteROSController extends ROSController implements FXGUISCXMLRemote {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(RemoteROSController.class);

    private SimpleStringProperty status;
    private boolean running;

    public RemoteROSController(GraphName gn, String serverTopic) {
        super(gn, serverTopic);

        status = new SimpleStringProperty();

    }

    @Override
    public StringProperty getStatusProp() {
        return status;
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
        logger.debug("added state List trigger");

        RemoteROSController r = this;

        Task task = new Task<Void>() {

            List<String> evs = new LinkedList<>();

            @Override
            protected Void call() throws Exception {
                while (running) {
                    List<String> ids = r.getCurrentStates();
                    List<String> ev = r.getTransitions();
                    ObservableList o = FXCollections.observableArrayList();
                    o.addAll(ids);
                    list.updateStateList(o);
                    if (changed(evs, ev)) {
                        evs = ev;
                        o = FXCollections.observableArrayList();
                        o.addAll(ev);
                        list.updateEventList(o);
                    }

                    Thread.sleep(333);
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

}
