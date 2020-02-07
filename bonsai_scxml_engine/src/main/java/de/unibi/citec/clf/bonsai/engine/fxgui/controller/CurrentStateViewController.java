package de.unibi.citec.clf.bonsai.engine.fxgui.controller;


import com.sun.javafx.css.StyleManager;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.ICurrentStateListener;
import de.unibi.citec.clf.bonsai.engine.fxgui.renameme.IStateControlListener;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.collections.ObservableList;
import javafx.fxml.FXML;
import javafx.scene.control.ListView;
import javafx.scene.control.ToggleButton;

import java.net.URL;
import java.util.LinkedList;
import java.util.List;

/**
 * FXML Controller class
 *
 * @author lruegeme
 */
public class CurrentStateViewController implements ICurrentStateListener {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(CurrentStateViewController.class);

    private FXGUISCXMLRemote remote = null;

    private List<IStateControlListener> listener = new LinkedList<>();

    public void addControlListener(IStateControlListener l) {
        listener.add(l);
    }

    @FXML
    private ListView stateListView;

    @FXML
    private ToggleButton toggleStopEvents;

    @FXML
    private ListView eventListView;

    @FXML
    protected void buttonStopEvents() {
        logger.info("stop:" + toggleStopEvents.isSelected());
        if (remote == null) {
            logger.fatal("no remote set");
            return;
        }

        if (toggleStopEvents.isSelected()) {
            this.stopEvents();
        } else {
            this.startEvents();
        }


    }

    public void startEvents() {
        logger.info("enable automatic events");
        remote.stopAutomaticEvents(false);

        Application.setUserAgentStylesheet(null);
    }

    public void stopEvents() {
        logger.info("disable automatic events");
        remote.stopAutomaticEvents(true);

        Application.setUserAgentStylesheet(null);
        URL resource = getClass().getClassLoader().getResource("de/unibi/citec/clf/bonsai/engine/fxgui/css/default.css");
        StyleManager.getInstance().addUserAgentStylesheet(resource.toString());
        //Application.setUserAgentStylesheet(resource.toExternalForm())
        logger.fatal(resource);
    }

    public void resetStopEventsButton() {
        toggleStopEvents.setSelected(false);
        this.startEvents();
    }

    @FXML
    protected void buttonStop() {
        logger.info("stop statemachine");
        if (remote == null) {
            logger.fatal("remote not set");
            return;
        }
        remote.stop();
        resetStopEventsButton();
        listener.stream().forEach(IStateControlListener::statemachineStopped);
    }

    @FXML
    private void initialize() {
        logger.debug("CurrentStateViewController initialized");
    }

    @FXML
    private void buttonSend() {
        if (remote == null) {
            logger.fatal("remote not set");
            return;
        }

        String s = null;
        try {
            s = (String) eventListView.getSelectionModel().getSelectedItem();
        } catch (Exception e) {
            logger.warn(e);
        }
        if (s != null) {
            remote.fireEvent(s);
        } else {
            logger.error("error while fireing event");
        }

    }

    @Override
    public void updateEventList(ObservableList values) {
        logger.trace("event list updated" + values);
        Platform.runLater(() -> eventListView.setItems(values));
    }

    @Override
    public void updateStateList(ObservableList values) {
        Platform.runLater(() -> stateListView.setItems(values));
    }

    public void setRemote(FXGUISCXMLRemote r) {
        remote = r;
    }

}
