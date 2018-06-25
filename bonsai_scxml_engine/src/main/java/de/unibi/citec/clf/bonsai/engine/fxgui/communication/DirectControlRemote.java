package de.unibi.citec.clf.bonsai.engine.fxgui.communication;

import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.engine.fxgui.ExitListener;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.concurrent.Task;
import org.apache.commons.scxml.model.Transition;
import org.apache.log4j.Logger;

import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/**
 * Created by lruegeme on 1/22/18.
 */
public class DirectControlRemote implements FXGUISCXMLRemote {

    static final Logger logger = org.apache.log4j.Logger.getLogger(DirectControlRemote.class);

    StateMachineController smc;
    private SimpleStringProperty status;
    private boolean running = true;

    private ExitListener exitListener;

    public DirectControlRemote(StateMachineController smc) {
        this.smc = smc;

        status = new SimpleStringProperty();
    }


    public void setExitListener(ExitListener e) {
        exitListener = e;
    }

    @Override
    public boolean fireEvent(String event) {
        smc.fireEvent(event);
        return true;
    }

    @Override
    public List<String> getCurrentStates() {
        return smc.getCurrentStateList();
    }

    @Override
    public List<String> getStateIds() {
        return smc.getAllStateIds();
    }

    @Override
    public List<String> getTransitions() {
        List<String> ret = new LinkedList<>();
        for (Transition t : smc.getPossibleTransitions()) {
            ret.add(t.getEvent());
        }

        return ret;
    }

    @Override
    public String load(String pathToConfig, String pathToTask, Map<String, String> includeMapping) {
        smc.setConfigPath(pathToConfig);
        smc.setTaskPath(pathToTask);
        return smc.load().toString();
    }

    @Override
    public boolean pause() {
        smc.pauseStateMachine();
        return true;
    }

    @Override
    public boolean resume() {
        smc.continueStateMachine();
        return true;
    }

    @Override
    public boolean setParams(Map<String, String> map) {
        smc.setDatamodelParams(map);
        return true;
    }

    @Override
    public boolean start() {
        smc.executeStateMachine();
        return true;
    }

    @Override
    public boolean start(String state) {
        smc.executeStateMachine(state);
        return true;
    }

    @Override
    public boolean stop() {
        smc.stopStateMachine();
        return true;
    }

    @Override
    public boolean stopAutomaticEvents(boolean b) {
        smc.enableAutomaticEvents(!b);
        return true;
    }

    @Override
    public void exit() {
        try {
            smc.stopStateMachine();
            smc.resetStateMachine();
        } catch (Exception e) {
            logger.warn(e);
        }

        exitListener.exit();

    }

    @Override
    public void addStateTrigger(IStateListener list) {
        Task task = new Task<Void>() {

            List<String> old = new LinkedList<>();

            @Override
            protected Void call() throws Exception {
                while (running) {
                    List<String> ids = smc.getAllStateIds();

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

        final DirectControlRemote directControlRemote = this;

        Task task = new Task<Void>() {

            List<String> evs = new LinkedList<>();

            @Override
            protected Void call() throws Exception {
                while (running) {
                    List<String> ids = smc.getCurrentStateList();
                    List<String> ev = directControlRemote.getTransitions();
                    ObservableList<String> o = FXCollections.observableArrayList();
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

    @Override
    public StringProperty getStatusProp() {
        return status;
    }
}
