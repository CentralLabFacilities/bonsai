package de.unibi.citec.clf.bonsai.engine.control;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.engine.SkillStateMachine;
import de.unibi.citec.clf.bonsai.engine.LoadingResults;
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus;
import de.unibi.citec.clf.bonsai.engine.scxml.SkillExceptionHandler;
import org.apache.commons.scxml.model.SCXML;
import org.apache.commons.scxml.model.Transition;
import org.apache.commons.scxml.model.TransitionTarget;
import org.apache.log4j.Logger;

import java.util.*;

/**
 * Controller for the SCXML state machine.
 *
 * @author lkettenb
 */
public class StateMachineController extends TimerTask implements SkillExceptionHandler {

    private String pathToConfig = null;
    private String pathToTask = null;
    private SkillStateMachine skillStateMachine = null;
    private static Logger logger = Logger.getLogger(StateMachineController.class);
    private boolean exitOnFailure = false;

    /**
     * Convenience constructor.
     */
    public StateMachineController() {
    }

    /**
     * Use this constructor if the path to task and configuration file is already known.
     *
     * @param pathToConfig Path to configuration file.
     * @param pathToTask   Path to task file.
     */
    public StateMachineController(String pathToConfig, String pathToTask) {
        this.pathToConfig = pathToConfig;
        this.pathToTask = pathToTask;
    }

    /**
     * Use this constructor if the path to task and configuration file is already known.
     *
     * @param skm           instance of the state machine
     * @param pathToConfig  Path to configuration file.
     * @param pathToTask    Path to task file.
     * @param exitOnFailure Exit program if something went wrong.
     */
    public StateMachineController(SkillStateMachine skm, String pathToConfig, String pathToTask, boolean exitOnFailure) {
        this(pathToConfig, pathToTask);
        this.exitOnFailure = exitOnFailure;
        this.skillStateMachine = skm;
    }

    /**
     * Initialize controller, setup GUI, add listener, etc.
     */
    public void initialize() {
        initialize(-1, "");
    }

    /**
     * Initialize controller, setup GUI, add listener, etc.
     *
     * @param autoStartDelay    Time in milliseconds until the state machine will start automatically. Or any negative
     *                          number if you do not want to use this feature.
     * @param loggingProperties
     */
    public void initialize(long autoStartDelay, final String loggingProperties) {

        if (skillStateMachine != null && autoStartDelay >= 0) {
            System.out.println("timer with autostartdelay:" + autoStartDelay);
            new Timer().schedule(this, autoStartDelay);
        }
    }

    public LoadingResults load() {
        return load(pathToConfig, pathToTask);
    }

    public LoadingResults load(String pathToConfig, String pathToTask) {
        LoadingResults results;
        try {
            results = skillStateMachine.initalize(pathToTask, pathToConfig);
        } catch (Exception t) {
            logger.error("Fatal state machine configuration error: " + t.getClass().getSimpleName() + ": " + t.getMessage(), t);
            logger.debug(t);
            throw new ConfigurationException(t);
        }

        skillStateMachine.addExceptionHandler(this);
        return results;
    }

    public void executeStateMachine() {
        skillStateMachine.startMachine();
    }

    public void executeStateMachine(TransitionTarget initial) {
        SCXML scxml = skillStateMachine.getSCXML();
        scxml.setInitialTarget(initial);
        skillStateMachine.setScxml(scxml);
        skillStateMachine.startMachine();
    }

    public void executeStateMachine(String initial) {
        if (!initial.isEmpty()) {
            SCXML scxml = skillStateMachine.getSCXML();
            Map a = scxml.getTargets();
            scxml.setInitialTarget((TransitionTarget) a.get(initial));
            skillStateMachine.setScxml(scxml);
        }
        skillStateMachine.startMachine();
    }

    public void stopStateMachine() {
        // Stop state machine
        if (skillStateMachine != null) {
            skillStateMachine.stopMachine();
        }
    }

    public void resetStateMachine() {
        // Stop state machine
        if (skillStateMachine != null) {
            skillStateMachine.stopMachine();
            skillStateMachine.unloadBonsai();
        }
    }

    @Override
    public void handle(Throwable e) {
        //todo Controler should handle, old gui was stateMachineMainPanel.handle
    }

    @Override
    public void run() {
        if (pathToConfig != null && pathToTask != null) {
            logger.debug("config: " + pathToConfig + "\nTask:" + pathToTask);
            if (load().success()) {
                logger.debug("load successful");
            } else {
                logger.debug("load failed");
            }
            executeStateMachine();
        } else {
            logger.warn("Unable to run state machine automatically. " + "Configuration or task file not specified.");
        }
    }

    public void addAditionalPermanentSensors(Map<String, Class<?>> rs) {
        skillStateMachine.addAditionalPermanentSensors(rs);
    }

    //TODO statemachine publishes current states
    //status
    //etc
    public void continueStateMachine() {
        if (skillStateMachine != null && !skillStateMachine.isRunning()) {
            skillStateMachine.continueStateMachine();
        }
    }

    public void pauseStateMachine() {
        if (skillStateMachine != null && skillStateMachine.isRunning()) {
            skillStateMachine.pauseMachine();
        }
    }

    public void fireEvent(String string) {
        if (skillStateMachine != null) {
            skillStateMachine.fireEvent(string);
        }
    }

    public boolean isInitialized() {
        return skillStateMachine.isInitialized();
    }

    public String getLastTask() {
        return skillStateMachine.lastPathToTask;
    }
    public String getLastConfig() {
        return skillStateMachine.lastPathToConfig;
    }

    public StatemachineStatus getStatus(){
        return skillStateMachine.getStatemachineStatus();
    }


    public void setConfigPath(String path) {
        pathToConfig = path;
    }

    public void setTaskPath(String path) {
        pathToTask = path;
    }

    public List<Transition> getPossibleTransitions() {
        return skillStateMachine.getPossibleTransitions();
    }

    public void setDatamodelParams(Map<String, String> m) {
        skillStateMachine.setParams(m);
    }

    public List<String> getAllStateIds() {
        List<String> list = new LinkedList<>();
        skillStateMachine.getTransitionTargets().forEach(t -> list.add(t.getId()));
        return list;
    }

    public List<String> getCurrentStateList() {
        List<String> l = skillStateMachine.getActiveStates();
        logger.trace("active:" + l);
        return l;
    }

    public void enableAutomaticEvents(Boolean aBoolean) {
        skillStateMachine.enableAutomaticEvents(aBoolean);
    }

}
