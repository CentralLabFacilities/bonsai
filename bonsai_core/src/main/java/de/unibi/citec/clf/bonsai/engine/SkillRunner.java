package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import org.apache.log4j.Logger;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.*;

/**
 * This class can be run in a thread and invokes the different phases while executing a skill.
 *
 * @author lruegeme
 */
public class SkillRunner implements Runnable {

    private final Logger logger = Logger.getLogger(getClass());

    private static final int MAX_EXECUTION_TIME = 1000;

    private List<SkillListener> listeners = new LinkedList<>();

    private final AbstractSkill skill;

    public Map<String, String> getSlotMapping() {
        return slotMapping;
    }

    private final Map<String, String> slotMapping;

    public Map<String, String> getParameters() {
        return parameters;
    }

    private final Map<String, String> parameters;
    private final StateID id;

    private final Object loopCondition = new Object();
    private final Object monitor = new Object();
    private ExitToken fatalToken;
    private ExitToken loopToken;

    private boolean isPaused = false;
    private boolean forceEnd = false;
    private boolean isFinished = false;

    SkillConfigurator configurator;

    /**
     * @param skill
     * @param stateId
     * @param vars
     * @param slotMapping
     * @param listener
     */
    public SkillRunner(AbstractSkill skill, StateID stateId, Map<String, String> vars, Map<String, String> slotMapping, SkillListener listener) {
        super();
        this.skill = skill;

        this.id = stateId;
        this.slotMapping = (slotMapping != null) ? slotMapping : new HashMap<>();
        this.parameters = (vars != null) ? vars : new HashMap<>();
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public SkillRunner(AbstractSkill skill) {
        super();
        this.skill = skill;

        StateID id = null;
        try {
            id = new StateID(skill.getClass().getName());
        } catch (StateIDException e) {
        }

        this.id = id;
        this.slotMapping = new HashMap<>();
        this.parameters = new HashMap<>();
    }


    public SkillRunner(StateID stateId, SkillListener listener) throws ClassNotFoundException {
        this(stateId, null, null, listener);
    }

    public SkillRunner(StateID stateId) throws ClassNotFoundException {
        this(stateId, null, null, null);
    }

    public SkillRunner(StateID stateId, Map<String, String> vars) throws ClassNotFoundException {
        this(stateId, vars, null, null);
    }

    public SkillRunner(StateID stateId, Map<String, String> vars, Map<String, String> slotMapping) throws ClassNotFoundException {
        this(stateId, vars, slotMapping, null);
    }

    public SkillRunner(StateID stateId, Map<String, String> vars, Map<String, String> slotMapping, SkillListener listener) throws ClassNotFoundException {
        super();

        try {

            Class<?> c = Class.forName(stateId.getFullSkill());
            Constructor<?>[] constrs = c.getConstructors();
            Constructor<?> aConstructor = constrs[0];
            this.skill = (AbstractSkill) aConstructor.newInstance();
        } catch (InstantiationException | IllegalAccessException | IllegalArgumentException | InvocationTargetException ex) {
            //should not happen eh?
            throw new ClassNotFoundException(stateId.getFullSkill());
        }

        this.id = stateId;
        this.slotMapping = (slotMapping != null) ? slotMapping : new HashMap<>();
        this.parameters = (vars != null) ? vars : new HashMap<>();
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public void configure(boolean checkCoreCreation) throws ConfigurationException {
        SkillConfigurator.Config cfg = SkillConfigurator.getDefaultConf();
        cfg.checkCoreCreation = checkCoreCreation;

        configurator = SkillConfigurator.createConfigPhase(cfg, parameters);

        this.skill.configure(configurator);
        configurator.activateObjectPhase(parameters, slotMapping);
    }

    public void configure(SkillConfigurator.Config cfg) throws ConfigurationException {

        configurator = SkillConfigurator.createConfigPhase(cfg, parameters);

        this.skill.configure(configurator);
        configurator.activateObjectPhase(parameters, slotMapping);
    }

    public void tryConfigure() throws SkillConfigurationException {
        SkillConfigurator.Config cfg = SkillConfigurator.getDefaultConf();
        configurator = SkillConfigurator.createConfigPhase(cfg, parameters);
        this.skill.configure(configurator);
    }

    public Set<ExitToken> inspectionGetRequestedTokens() {
        return configurator.getRegisteredExitTokens();
    }

    public Map<String, Class<?>> inspectionGetInSlots() {
        return configurator.getSlotReaderRequests();
    }

    public Map<String, Class<?>> inspectionGetOutSlots() {
        return configurator.getSlotWriterRequests();
    }

    public Map<String, Class<?>> inspectionGetAllSlots() {
        return configurator.getSlotRequests();
    }

    public Map<String, Class> inspectionGetRequiredParams() {
        return configurator.getRequiredParams();
    }

    public Map<String, Class> inspectionGetAllOptionalParams() {
        return configurator.getOptionalParams();
    }

    public Set<String> inspectionGetUnusedParams() {
        return configurator.getUnusedParams();
    }

    public Map<String, Class> inspectionGetUnusedOptionalParams() {
        return configurator.getUnusedOptionalParams();
    }


    public List<ConfigurationException> getErrors() {
        return configurator.getExceptions();
    }

    public ExitStatus execute() throws SkillConfigurationException {
        if (configurator != null && !configurator.isSkillConfigured()) {
            throw new SkillConfigurationException("skill not configured");
        }

        String myID = id.getCanonicalID();

        if (configurator == null) {
            throw new SkillConfigurationException("skill not configured");
        }

        ExitToken successToken = configurator.requestExitToken(ExitStatus.SUCCESS());
        fatalToken = configurator.requestExitToken(ExitStatus.FATAL());
        loopToken = configurator.requestExitToken(ExitStatus.LOOP());

        //
        // STATE CONFIG PHASE
        //
        logger.debug("  " + myID + " -> invoke configure().");
        skill.configure(configurator);

        checkPause();

        //
        // INIT PHASE
        //
        logger.debug("  " + myID + " -> invoke init()");
        boolean initStatus = skill.init();
        logger.debug("  " + myID + " -> init() returned: " + initStatus);

        checkPause();

        //
        // EXECUTION PHASE
        //
        ExitToken exitToken = (initStatus) ? successToken : fatalToken;
        if (initStatus) {
            logger.debug("  " + myID + " -> invoke execute()");
            exitToken = invokeExecute(exitToken.getExitStatus());
            logger.debug("  " + myID + " -> execute() returned: " + exitToken.getExitStatus().getStatus());
        }

        checkPause();

        //
        // END PHASE
        //
        logger.debug("  " + myID + " -> invoke end()");
        ExitToken endStatus = skill.end(exitToken);
        logger.debug("  " + myID + " -> end() returned: " + endStatus.getExitStatus().getStatus());

        //
        // CLEAN UP
        //
        skill.cleanUp(configurator);

        ExitStatus finalStatus;
        if ((exitToken.getExitStatus().isSuccess() && !endStatus.getExitStatus().isSuccess())
                || (exitToken.getExitStatus().isSuccess() == endStatus.getExitStatus().isSuccess() && endStatus.getExitStatus().hasProcessingStatus())) {
            finalStatus = endStatus.getExitStatus();
        } else {
            finalStatus = exitToken.getExitStatus();
        }
        setExecuted(finalStatus);

        return finalStatus;

    }

    @Override
    public void run() {
        try {
            execute();
        } catch (Throwable e) {
            setAborted(e);
            logger.fatal("An exception occurred while executing state: " + id.getCanonicalID() + ": " + e.getMessage(), e);
        }
    }

    /**
     * This method invokes the <code>execute()</code> method of this state.
     *
     * @return Exit status returned by <code>execute()</code> method.
     * @see AbstractSkill#execute()
     * @see ExitStatus
     */
    private ExitToken invokeExecute(ExitStatus currentStatus) {
        // Invoke execute() as long as processing status is equals "wait"
        // and the state did not FATAL.
        ExitToken tmpExitStatus = loopToken;

        try {
            do {
                checkPause();
                long timeExecutionBegin = Time.currentTimeMillis();
                tmpExitStatus = skill.execute(currentStatus);
                checkExecutionTime(timeExecutionBegin);
                if (tmpExitStatus.getExitStatus().looping() && !isForcedToEnd()) {
                    synchronized (loopCondition) {
                        try {
                            loopCondition.wait(tmpExitStatus.getExitStatus().getLoopDelay());
                        } catch (InterruptedException e) {
                            logger.debug("looping cancelled");
                            Thread.currentThread().interrupt();
                        }
                    }
                }
            } while (tmpExitStatus.getExitStatus().looping() && !isForcedToEnd());

            if (isForcedToEnd()) {
                logger.debug("Loop was forced to end");
                if (tmpExitStatus.getExitStatus().looping()) {
                    logger.warn("Skill was forced to end while looping.");
                    return fatalToken;
                }
            }
        } catch (NullPointerException e) {
            logger.error("NullPointer from execute!!", e);
            e.printStackTrace();
            return fatalToken;
        }
        return tmpExitStatus;
    }

    private void checkExecutionTime(long begin) {
        long duration = Time.currentTimeMillis() - begin;
        if (duration > MAX_EXECUTION_TIME) {
            logger.warn("\n\n!!! Skill '" + skill.getClass().getSimpleName() + "' took too long (" + duration
                    + "ms) !!!\n    -> make sure your execute method does not block longer than " + MAX_EXECUTION_TIME
                    + "ms!\n");
        }
    }

    protected synchronized boolean isForcedToEnd() {
        return forceEnd;
    }

    /**
     * Marks the state as executed and calls all waiting threads.
     */
    private synchronized void setExecuted(ExitStatus endStatus) {
        isFinished = true;
        listeners.forEach((listener) -> {
            listener.skillFinished(id, endStatus);
        });
        notifyAll();
    }

    /**
     * Marks the state as broken and calls all waiting threads.
     */
    private synchronized void setAborted(Throwable e) {
        isFinished = false;
        listeners.forEach((listener) -> {
            listener.skillAborted(id, e);
        });
        notifyAll();
    }

    /**
     * Force this state to end as soon as possible.
     *
     * <code>true</code> if the reason is a timeout.
     */
    public synchronized void forceEnd() {
        logger.debug("Forcing skill to end: " + id.getCanonicalSkill());
        forceEnd = true;
        try {
            logger.debug("notify loop to stop");
            synchronized (loopCondition) {
                loopCondition.notifyAll();
            }

            logger.debug("waiting for skill to quit");
            wait(1000);

        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            logger.error("Error while waiting for thread", ex);
        }
    }

    /**
     * Indicates if this state has been executed.
     *
     * @return True if this state has been executed, false otherwise.
     */
    public boolean hasBeenExecuted() {
        return isFinished;
    }

    public void setPause(boolean pause) {
        this.isPaused = pause;
        synchronized (monitor) {
            monitor.notifyAll();
        }
    }

    private void checkPause() {

        while (isPaused) {
            synchronized (monitor) {
                try {
                    monitor.wait();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }

        }
    }

}
