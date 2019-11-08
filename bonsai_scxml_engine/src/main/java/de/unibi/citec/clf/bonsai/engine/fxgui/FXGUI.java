package de.unibi.citec.clf.bonsai.engine.fxgui;


import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.controller.CurrentStateViewController;
import de.unibi.citec.clf.bonsai.engine.fxgui.controller.SCXMLOverviewController;
import de.unibi.citec.clf.bonsai.engine.fxgui.renameme.IStateControlListener;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.image.Image;
import javafx.scene.layout.AnchorPane;
import javafx.stage.Stage;
import javafx.stage.WindowEvent;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class FXGUI extends Application implements IStateControlListener {

    private static Stage primaryStage;

    private static TabPane rootLayout;
    private Tab stateTab;
    private Tab scxmltab;

    private static FXGUISCXMLRemote remote = null;

    public static void setRemote(FXGUISCXMLRemote rem) {
        if (remote == null) {
            remote = rem;
        }
    }

    private static SCXMLOverviewController scxmlControl;
    private static CurrentStateViewController stateControl;

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(FXGUI.class);

    public static Stage getMainStage() {
        return primaryStage;
    }

    public static void setEnabled(boolean b) {
        logger.trace("set enabled not working");
    }

    @Override
    public void start(Stage primaryStage) {
        FXGUI.primaryStage = primaryStage;
        FXGUI.primaryStage.setTitle("BonSAI - FX");
        try {
            primaryStage.getIcons().add(new Image("icons/logo.png"));
        } catch (Exception ignored) { logger.warn("Exception when setting bonsai icon (probably image file not found)"); }

        primaryStage.setOnCloseRequest((WindowEvent we) -> {
            Platform.exit();
        });

        initRootLayout();
        initSCXMLTab();
        initStateTab();

        initRemote();
    }

    private void initRootLayout() {

        // Load root layout from fxml file.
        FXMLLoader loader = new FXMLLoader();
        loader.setLocation(FXGUIStarter.class.getResource("fxml/RootLayout.fxml"));
        try {
            rootLayout = (TabPane) loader.load();
        } catch (IOException e) {
            logger.fatal(e);
            return;
        }

        // Show the scene containing the root layout.
        Scene scene = new Scene(rootLayout);
        primaryStage.setScene(scene);
        primaryStage.show();

    }

    private void initSCXMLTab() {
        FXMLLoader loader = new FXMLLoader(FXGUIStarter.class.getResource("fxml/SCXMLOverview.fxml"));
        AnchorPane scxmlLayout;
        try {
            scxmlLayout = (AnchorPane) loader.load();
        } catch (IOException ex) {
            logger.fatal(ex);
            return;
        }
        scxmltab = new Tab();
        scxmltab.setText("SCXML");
        scxmltab.setContent(scxmlLayout);
        rootLayout.getTabs().add(scxmltab);

        scxmlControl = loader.<SCXMLOverviewController>getController();
        scxmlControl.addControlListener(this);
        scxmlControl.setPath(FXGUIStarter.pathToConfig, FXGUIStarter.pathToTask);
        scxmlControl.setIncludeMapping(FXGUIStarter.includeMappings);

    }

    private void initStateTab() {
        FXMLLoader loader = new FXMLLoader(FXGUIStarter.class.getResource("fxml/StateView.fxml"));
        AnchorPane stateLayout;
        try {
            stateLayout = (AnchorPane) loader.load();
        } catch (IOException ex) {
            logger.fatal(ex);
            return;
        }

        stateTab = new Tab();
        stateTab.setText("State");
        stateTab.setContent(stateLayout);
        rootLayout.getTabs().add(stateTab);

        stateControl = loader.<CurrentStateViewController>getController();
        stateControl.addControlListener(this);


    }

    private void initRemote() {
        try {

            scxmlControl.bindStatusLabel(remote.getStatusProp());
            scxmlControl.setRemote(remote);
            stateControl.setRemote(remote);

            remote.addCurrentStateTrigger(stateControl);
            remote.addStateTrigger(scxmlControl);

        } catch (Exception ex) {
            logger.fatal(ex);
            System.exit(1);
        }
    }

    @Override
    public void statemachineStarted() {
        logger.debug("statemachine started");
        rootLayout.getSelectionModel().select(stateTab);
    }

    @Override
    public void statemachineStopped() {
        logger.debug("statemachine stopped");
        stateControl.resetStopEventsButton();
        rootLayout.getSelectionModel().select(scxmltab);

    }

    @Override
    public void stop() {
        System.out.println("FXGui close");
        remote.exit();
        System.exit(1);
    }


}
