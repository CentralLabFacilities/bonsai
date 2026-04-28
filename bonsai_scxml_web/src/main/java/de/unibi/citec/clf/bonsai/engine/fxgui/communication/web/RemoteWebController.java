package de.unibi.citec.clf.bonsai.engine.fxgui.communication.web;


import de.unibi.citec.clf.bonsai.engine.communication.web.WebController;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.ICurrentStateListener;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.IStateListener;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import org.jetbrains.annotations.NotNull;

import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * @author lruegeme
 */
public class RemoteWebController extends WebController implements FXGUISCXMLRemote {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(RemoteWebController.class);

    private SimpleStringProperty status;
    private boolean running = true;

    private ICurrentStateListener listener;

    public RemoteWebController(@NotNull String host, int port) {
        super(host, port);
        status = new SimpleStringProperty();
    }
    @Override
    public void addCurrentStateTrigger(ICurrentStateListener list) {
        listener = list;
        RemoteWebController r = this;

        Task task = new Task<Void>() {

            List<String> old = new LinkedList<>();

            @Override
            protected Void call() throws Exception {
                while (running) {
                    List<String> ids = r.getCurrentStates();
                    List<String> ev = r.getTransitions();
                    logger.debug("current states: " + ids);

                    ObservableList o = FXCollections.observableArrayList();
                    o.addAll(ids);
                    if (listener != null) listener.updateStateList(o);

                    o = FXCollections.observableArrayList();
                    o.addAll(ev);
                    if (listener != null) listener.updateEventList(o);

                    Thread.sleep(250);
                }
                return null;
            }

        };
        new Thread(task).start();

    }

    @Override
    public void addStateTrigger(IStateListener list) {
        RemoteWebController r = this;
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
    public StringProperty getStatusProp() {
        return status;
    }
}
