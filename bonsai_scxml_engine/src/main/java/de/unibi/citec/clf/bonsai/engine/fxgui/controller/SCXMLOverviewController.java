package de.unibi.citec.clf.bonsai.engine.fxgui.controller;



import com.sun.javafx.css.StyleManager;
import de.unibi.citec.clf.bonsai.engine.fxgui.FXGUI;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.IStateListener;
import de.unibi.citec.clf.bonsai.engine.fxgui.renameme.IStateControlListener;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.beans.property.StringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.Priority;
import javafx.stage.FileChooser;
import javafx.stage.FileChooser.ExtensionFilter;
import org.apache.commons.text.similarity.FuzzyScore;

import java.io.File;
import java.net.URL;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.prefs.Preferences;

/**
 * FXML Controller class
 *
 * @author lruegeme
 */
public class SCXMLOverviewController implements IStateListener {

    private static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(SCXMLOverviewController.class);
    private FXGUISCXMLRemote remote = null;

    private List<IStateControlListener> listener = new LinkedList<>();

    @FXML
    private TextField filterField;

    @FXML
    private ListView stateListView;

    @FXML
    private TextField textConfig;

    @FXML
    private Label labelStatus;

    @FXML
    private Button buttonLoad;

    @FXML
    private TextField textScxml;
    private Map<String, String> includeMapping = new HashMap<>();

    private ObservableList<String> stateIds = FXCollections.observableArrayList();

    public void addControlListener(IStateControlListener l) {
        listener.add(l);
    }

    public void setRemote(FXGUISCXMLRemote r) {
        remote = r;
    }

    public void updateStateList() {
        ObservableList data = FXCollections.observableArrayList();
        System.out.println("gettingStates");
        List<String> stateIds = new ArrayList<>(new HashSet<>(remote.getStateIds()));
        System.out.println("got states ");
        if (stateIds != null) {
            System.out.println("got states " + stateIds.size());
            Collections.sort(stateIds);
            data.addAll(stateIds);
            this.setNewStateList(data, null);
        }
    }

    public synchronized void setNewStateList(ObservableList<String> values, Object def) {

        Platform.runLater(
                () -> {
                    stateIds.removeAll();
                    stateIds.addAll(values);
                    System.out.println("setNewStateList");
                    if (def != null) {
                        stateListView.getSelectionModel().select(def);
                    } else {
                        stateListView.getSelectionModel().clearSelection();
                    }
                }
        );

    }

    @FXML
    private void initialize() {
        logger.debug("SCXMLOverviewController initialized");

        final FilteredList<String> filteredData = new FilteredList<>(stateIds, p -> true);
        final FuzzyScore fuzzer = new FuzzyScore(Locale.ENGLISH);
        final String minScoreKey = "@maxScore";

        //Map<String, Double> distanceMap = new ConcurrentHashMap<>();
        final Map<String, Integer> distanceMap = new ConcurrentHashMap<>();
        //distanceMap.put(minScoreKey, -1);

        filterField.textProperty().addListener((observable, oldValue, newValue) -> {
            if (newValue == null || newValue.isEmpty()) {
                distanceMap.clear();
            }

            if(oldValue != null && newValue != null && oldValue.length() > newValue.length()) {
                distanceMap.put(minScoreKey,newValue.length());
            }

            final int oldMax = distanceMap.getOrDefault(minScoreKey,newValue.length());
            final int minScore = (oldMax > newValue.length()) ? (oldMax / 2) : newValue.length();

            filteredData.setPredicate(id -> {
                if (newValue == null || newValue.isEmpty()) {
                    return true;
                }

                final int score = fuzzer.fuzzyScore(id,newValue);
                distanceMap.put(id,score);

                if(score >= minScore) {
                    return true;
                }

                logger.trace(id + ": score below min ("+minScore+")");

                return false; // Does not match.
            });

            final int maxScore = distanceMap.values().stream().max(Integer::compareTo).orElse(-1);
            distanceMap.put(minScoreKey, maxScore);
        });

        final SortedList<String> sortedData = new SortedList<>(filteredData);
        sortedData.comparatorProperty().setValue((string1, string2) -> {
            int id1val = distanceMap.getOrDefault(string1,-1);
            int id2val = distanceMap.getOrDefault(string2,-1);

            if(id1val == id2val) {
                String id1 = string1.toUpperCase();
                String id2 = string2.toUpperCase();
                //ascending order
                return id1.compareTo(id2);
            } else {
                //descending order
                return Integer.compare(id2val,id1val);
            }
        });



        stateListView.setItems(sortedData);
    }

    @FXML
    protected void browseConfig() {
        selectFile(textConfig);
    }

    @FXML
    protected void browseScxml() {
        selectFile(textScxml);
    }

    @FXML
    protected void deselectState() {
        stateListView.getSelectionModel().clearSelection();
    }

    @FXML
    protected void buttonStart() {
        if (remote == null) {
            logger.fatal("remote not set");
            return;
        }

        logger.info("enable automatic events");
        remote.stopAutomaticEvents(false);
        String s = null;
        try {
            s = (String) stateListView.getSelectionModel().getSelectedItem();
        } catch (Exception e) {

        }
        logger.debug("button start with initial: " + s);
        if (s != null) {
            remote.start(s);
        } else {
            remote.start();
        }

        listener.stream().forEach(IStateControlListener::statemachineStarted);

        stateListView.getSelectionModel().clearSelection();
    }

    private void showResultAlert(String text) {
        logger.info("Loading Results:\n" + text);
        Alert alert = new Alert(AlertType.INFORMATION);
        alert.setTitle("Loading Results");
        alert.setHeaderText(null);
        //alert.s

        //Label label = new Label("The exception stacktrace was:");
        TextArea textArea = new TextArea(text);
        textArea.setEditable(false);
        textArea.setWrapText(true);

        textArea.setMaxWidth(Double.MAX_VALUE);
        textArea.setMaxHeight(Double.MAX_VALUE);
        GridPane.setVgrow(textArea, Priority.ALWAYS);
        GridPane.setHgrow(textArea, Priority.ALWAYS);

        GridPane expContent = new GridPane();
        expContent.setMaxWidth(Double.MAX_VALUE);
        //expContent.add(label, 0, 0);
        expContent.add(textArea, 0, 0);

        // Set expandable Exception into the dialog pane.
        //alert.getDialogPane().setExpandableContent(expContent);
        alert.getDialogPane().setContent(expContent);
        alert.showAndWait();
    }

    @FXML
    protected void buttonLoad() {
        if (remote == null) {
            logger.fatal("remote not set");
            return;
        }
        FXGUI.setEnabled(false);

        Preferences prefs = Preferences.userRoot().node("StateMachine FXGUI");
        prefs.put("configFilePath", textConfig.getText());
        prefs.put("taskFilePath", textScxml.getText());

        filterField.textProperty().setValue("");

        new Thread(()-> {
            String ret = remote.load(textConfig.getText(), textScxml.getText(), includeMapping);
            Platform.runLater(() -> {
                if (!ret.isEmpty()) {
                    showResultAlert(ret);
                } else {
                    logger.info("loading finished without error");

                }
                FXGUI.setEnabled(true);
            });
        }).start();

        //logger.info("getting states...");

        //setStateList();


    }

    private void selectFile(TextField f) {
        File file = null;
        FileChooser fileChooser = new FileChooser();
        try {
            String fileName = f.getText().replaceFirst("^~/", System.getProperty("user.home"));
            file = new File(fileName);
            if (file.exists()) {
                fileChooser.setInitialDirectory(file.getParentFile());
            }
        } catch (IllegalArgumentException e) {
        }
        fileChooser.setTitle("Open Resource File");
        fileChooser.getExtensionFilters().addAll(
                new ExtensionFilter("XML Files", "*.xml"),
                new ExtensionFilter("SCXML Files", "*.scxml"));
        file = fileChooser.showOpenDialog(FXGUI.getMainStage());
        if (file != null) {
            f.setText(file.getAbsolutePath());
        }

    }

    public void bindStatusLabel(StringProperty statusLabelProp) {
        Task<Void> task = new Task<Void>() {
            @Override
            public Void call() throws InterruptedException {
                while (!isCancelled()) {
                    updateMessage(statusLabelProp.get());
                    Thread.sleep(100);
                }
                return null;
            }
        };
        labelStatus.textProperty().bind(task.messageProperty());
        Thread thread = new Thread(task);
        thread.setDaemon(true);
        thread.start();

    }

    public void setPath(String conf, String task) {
        textConfig.setText(conf);
        textScxml.setText(task);
    }

    @Override
    public void setStateList(ObservableList<String> values) {
        this.setNewStateList(values, null);
    }

    public void setIncludeMapping(Map<String, String> map) {
        includeMapping = map;
    }
}
