package de.unibi.citec.clf.bonsai.engine;


import de.unibi.citec.clf.bonsai.core.BonsaiManager;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationParser;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.XmlConfigurationParser;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher;
import de.unibi.citec.clf.bonsai.engine.communication.StatemachineStatus;
import de.unibi.citec.clf.bonsai.engine.config.SkillStateMachineConfig;
import de.unibi.citec.clf.bonsai.engine.scxml.BonsaiTransition;
import de.unibi.citec.clf.bonsai.engine.scxml.SCXMLSkillRunner;
import de.unibi.citec.clf.bonsai.engine.scxml.SkillExceptionHandler;
import de.unibi.citec.clf.bonsai.engine.scxml.config.StateMachineConfigurator;
import de.unibi.citec.clf.bonsai.engine.scxml.config.StateMachineConfiguratorResults;
import de.unibi.citec.clf.bonsai.engine.scxml.config.ValidationResult;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.LoadingException;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.StateMachineException;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.StateNotFoundException;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.bonsai.util.helper.ListClass;
import org.apache.commons.scxml2.*;
import org.apache.commons.scxml2.env.SimpleErrorReporter;
import org.apache.commons.scxml2.env.jexl.JexlEvaluator;
import org.apache.commons.scxml2.model.*;
import org.apache.log4j.Logger;
import org.jetbrains.annotations.NotNull;

import javax.xml.transform.TransformerException;
import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;


public class SkillStateMachine implements SCXMLListener, SkillExceptionHandler {

    private final ScheduledExecutorService aliveScheduler = Executors
            .newScheduledThreadPool(1);
    private ScheduledFuture<?> aliveHandle;

    private List<SCXMLServer> scxmlServers = new ArrayList<>();

    private boolean triggerEvents = true;
    private SkillStateMachineConfig config = new SkillStateMachineConfig();


    public void setParams(Map<String, String> m) {
        logger.info("set params:" + m);
        datamodelParams = m;
    }

    public void enableAutomaticEvents(Boolean aBoolean) {
        triggerEvents = aBoolean;
    }


    private static final int MAX_EXCEPTION_HISTORY = 30;
    /**
     * The state machine that will drive the instances of this class.
     */
    private SCXML scxml = null;
    /**
     * The instance specific SCXML engine.
     */
    private SCXMLExecutor scxmlExecutor = null;
    /**
     * The log.
     */
    private static Logger logger = Logger.getLogger(SkillStateMachine.class);
    /**
     * Payload of last transition.
     */
    private Object payload = null;
    /**
     * Prefix of states (e.g. "de.unibi.citec.clf.bonsai.skills.").
     */



    public String lastPathToTask = "";
    public String lastPathToConfig = "";


    //private static SkillStateMachineConfig ssmConfig;

    /**
     * Hash map with active states.
     */
    private class ActiveStateMap extends HashMap<StateID, SCXMLSkillRunner> {
        private List<SCXMLServer> stateMapInformers = new ArrayList<>();

        public ActiveStateMap() {
            super();
        }

        public void addStateMapInformer(SCXMLServer informer) {
            stateMapInformers.add(informer);
        }

        @Override
        public SCXMLSkillRunner put(StateID id, SCXMLSkillRunner runner) {
            SCXMLSkillRunner ret = super.put(id, runner);
            sendCurrentStates();
            return ret;
        }

        @Override
        public SCXMLSkillRunner remove(Object id) {
            SCXMLSkillRunner ret = super.remove(id);
            sendCurrentStates();
            return ret;
        }

        @Override
        public void clear() {
            super.clear();
            sendCurrentStates();
        }

        public void sendCurrentStates() {

            List<String> states = new LinkedList<>();
            List<BonsaiTransition> transitions = new LinkedList<>();
            for (StateID id : this.keySet()) {
                if (config.useFullIdForStateInformer) {
                    states.add(id.getFullID());
                } else {
                    states.add(id.getCanonicalID());
                }
                transitions.addAll(getTransitionsByState(id.getFullID().replace(config.statePrefix, "")));
            }

            logger.trace("active states sent:" + states);
            stateMapInformers.forEach(it -> {
                List<BonsaiTransition> ts;
                if (config.sendAllPossibleTransitions) {
                    ts = getCurrentPossibleTransitions();
                } else {
                    ts = transitions;
                }
                if (!it.sendStatesWithTransitions()) {
                    ts = new LinkedList<>();
                }
                try {
                    it.sendCurrentStatesAndTransitions(states, ts);
                } catch (Exception e) {
                    logger.debug(e.getMessage(), e);
                    logger.warn(e.getMessage());
                }
            });

        }
    }

    private ActiveStateMap activeStates = new ActiveStateMap();

    /**
     * Hash map with corrupt states.
     */
    private HashMap<StateID, SCXMLSkillRunner> corruptStates = new HashMap<>();
    /**
     * EventDispatcher implementation that can schedule delayed events.
     */
    private ExecutorService skillExecutor = Executors.newCachedThreadPool();
    /**
     * Is the state machine paused?
     */
    private boolean PAUSE = false;
    /**
     * Is the state machine stopped?
     */
    private boolean running = false;
    private boolean isInitialized = false;
    private boolean isLoading = false;
    private StateMachineConfigurator configurator;
    private SCXMLValidator validator;
    private Set<SkillExceptionHandler> exceptionHandlers = new HashSet<>();
    final private LinkedList<Throwable> exceptions = new LinkedList<>();
    private Set<SCXMLListener> listeners = new HashSet<>();
    private HashMap<String, Class<?>> additionalPermanentSensors = new HashMap<>();
    private Map<String, String> datamodelParams = new HashMap<>();

    private final Map<String, String> includeMapping;

    /**
     * Factory for building an Instance.
     */


    public SkillStateMachine(Map<String, String> includeMapping) {
        this.includeMapping = includeMapping;
    }

    public void addServer(SCXMLServer server) {
        addServer(server, true);
    }

    public void addServer(SCXMLServer server, boolean sendAlive) {
        scxmlServers.add(server);
        logger.info("SCXML server set");

        activeStates.addStateMapInformer(server);

        if (sendAlive) {
            final Runnable alivePing = () -> {
                StatemachineStatus status = getStatemachineStatus();

                try {
                    server.sendStatus(status);
                    logger.trace("alive ping sent:" + status);
                    logger.trace("active states:" + getActiveStates());
                } catch (Exception e) {
                    logger.debug(e.getMessage(), e);
                    logger.warn(e.getMessage());
                }

            };

            aliveHandle = aliveScheduler.scheduleAtFixedRate(alivePing, 0, 5,
                    TimeUnit.SECONDS);
        }

    }

    @NotNull
    public StatemachineStatus getStatemachineStatus() {
        StatemachineStatus status = StatemachineStatus.UNKNOWN;
        if (isInitialized) {
            status = StatemachineStatus.INITIALIZED;
        }
        if(isLoading) {
            status = StatemachineStatus.LOADING;
        }
        if (running) {
            status = StatemachineStatus.RUNNING;
        }
        if (PAUSE && running) {
            status = StatemachineStatus.PAUSED;
        }
        return status;
    }

    /**
     * Initialize the state machine. Decodes SCXML task file.
     *
     * @param pathToTask   Path to SCXML task file.
     * @param pathToConfig Path to BonSAI configuration file.
     * @return <code>true</code> on success, <code>false</code> otherwise.
     * @throws StateNotFoundException
     * @throws StateIDException
     * @throws LoadingException
     * @throws TransformerException
     */
    public LoadingResults initalize(String pathToTask, String pathToConfig)
            throws StateNotFoundException, StateIDException, LoadingException, TransformerException {
        isLoading = true;
        pathToTask = pathToTask.replaceFirst("^~/", System.getProperty("user.home"));
        pathToConfig = pathToConfig.replaceFirst("^~/", System.getProperty("user.home"));
        lastPathToTask = pathToTask;
        lastPathToConfig = pathToConfig;
        scxml = SCXMLDecoder.parseSCXML(new File(pathToTask), includeMapping);
        if (scxml == null) {
            LoadingException e = new LoadingException(
                    "Error while decoding/parsing SCXML file.");
            logger.error(e.getMessage());
            throw e;
        }

        if (running) {
            stopMachine();
        }

        try {
            setupEngine(scxml);
        } catch (ModelException e) {
            throw new RuntimeException(e);
        }
        Exception cx = null;
        try {
            analyzeDatamodel();
        } catch (MapReader.KeyNotFound ex) {
            logger.fatal("configuration error: " + ex.getMessage());
            cx = ex;
        }

        LoadingResults results = new LoadingResults();
        ConfigurationParser parser = new XmlConfigurationParser();
        ConfigurationResults confResults = null;
        configurator = new StateMachineConfigurator(config.statePrefix);


        // Check if skills use existing sensors/actuators
        if(config.configureSkills) {
            StateMachineConfiguratorResults smResults = configurator
                    .configureSkills(scxml, config.generateDefaultSlots);

            Map<StateID, Set<ExitToken>> registeredTokens
                    = configurator.getRegisteredExitTokens();

            // Check if classes and transitions exist
            validator = new SCXMLValidator(this, config.statePrefix);
            ValidationResult scxmlValid = validator.validate(scxml, registeredTokens);

            Map<String, Class<?>> rs = configurator.getRequestedSensors();
            @SuppressWarnings("rawtypes")
            Map<String, ListClass> rls = configurator.getRequestedListSensors();
            Map<String, Class<? extends Actuator>> ra = configurator
                    .getRequestedActuators();
            Set<String> rwm = configurator.getRequestedWorkingMemories();

            rs.putAll(additionalPermanentSensors);


            try {
                BonsaiManager bm = BonsaiManager.getInstance();
                confResults = bm.configure(pathToConfig, parser, rs.keySet(),
                        rls.keySet(), ra.keySet(), rwm);

                confResults.merge(bm.canCreateSensors(rs));
                confResults.merge(bm.canCreateListSensors(rls));
                confResults.merge(bm.canCreateActuators(ra));
                confResults.merge(bm.canCreateWorkingMemories(rwm));
                if (cx != null) {
                    confResults.add(new ConfigurationException(cx));
                }

            } catch (Throwable t) {
                isInitialized = false;
                isLoading = false;
                logger.error(t.getMessage(), t);
                throw new LoadingException("configure failed: " + t.getMessage());
            }

            isInitialized = true;

            results.statePrefix = config.statePrefix;
            results.configurationResults = confResults;
            results.stateMachineResults = smResults;
            results.validationResult = scxmlValid;
            results.showDefaultSlotWarnings = config.showDefaultSlotWarnings;
        } else {

            results.stateMachineResults = configurator.configureSlotsOnly(scxml);
            try {
                BonsaiManager bm = BonsaiManager.getInstance();
                confResults = bm.configure(pathToConfig,parser);
            } catch (Throwable t) {
                isInitialized = false;
                isLoading = false;
                logger.error(t.getMessage(), t);
                throw new LoadingException("configure failed: " + t.getMessage());
            }

            isInitialized = true;
            results.statePrefix = config.statePrefix;
            results.configurationResults = confResults;
            results.showDefaultSlotWarnings = config.showDefaultSlotWarnings;
        }

        if (!results.success()) {
            logger.warn("\n\n####### RESULTS: ########\n" + results.toString() + "\n####### /RESULTS ########\n");
        } else {
            logger.debug("\n####### SUCCESS: ########");
        }

        if (config.enableSkillWarnings && !results.validationResult.getWarnings().isEmpty()) {
            logger.warn(results.validationResult.getWarnings());
        }

        String a = results.stateMachineResults.generateSlotHint(config.statePrefix, false);
        if (!a.isEmpty()) {
            logger.info("\nHint: Missing the following Slots:\n" + a);
        }
        a = results.validationResult.generateTransitionHints();
        if (!a.isEmpty()) {
            logger.info("\nHint: Missing the following Transitions:\n" + a);
        }

        isLoading = false;
        return results;

    }

    /**
     * Instantiate and initialize the underlying executor instance.
     *
     * @param stateMachine The state machine
     */
    private void setupEngine(final SCXML stateMachine) throws ModelException {
        scxmlExecutor = new SCXMLExecutor();
        // scxmlExecutor.sete
        //simpleScheduler = new SimpleScheduler(scxmlExecutor);
        //scxmlExecutor.setEventdispatcher(simpleScheduler);
        scxmlExecutor.setErrorReporter(new SimpleErrorReporter());
        try {
            scxmlExecutor.setEvaluator(new JexlEvaluator());
        } catch (ModelException e) {
            throw new RuntimeException(e);
        }
        scxmlExecutor.setStateMachine(stateMachine);
        scxmlExecutor.addListener(stateMachine, this);

    }

    /**
     * Analyze the data model and look for special variables like "#_STATE_PREFIX".
     *
     * @see SkillStateMachineConfig#statePrefix
     */
    private void analyzeDatamodel() throws MapReader.KeyNotFound {
        Map<String, String> data = getVariables(scxmlExecutor.getStateMachine()
                .getDatamodel());

        config.configure(data);
    }

    /**
     * Converts {@link Datamodel} into a key-value-map.
     *
     * @param model The input model.
     * @return A {@link Map} containing key-value pairs.
     */
    public Map<String, String> getVariables(Datamodel model) {

        HashMap<String, String> map = new HashMap<>();
        if (model == null) {
            return map;
        }

        Context ctx = scxmlExecutor.getGlobalContext();
        Evaluator eval = scxmlExecutor.getEvaluator();
        String atSymbol = "@";

        @SuppressWarnings("unchecked")
        List<Data> dataList = model.getData();
        for (Data data : dataList) {
            //logger.fatal(data.getId() + "---" + data.getExpr() );
            if (data == null) {
                logger.error("Data from DataModel is null!");
                continue;
            }
            String expr = data.getExpr();
            if (expr == null) {
                expr = "";
            }

            String name = expr.replaceAll("'", "");
            String value = name;
            if (name.startsWith(atSymbol)) {
                name = name.replaceFirst(atSymbol, "");

                if (datamodelParams.containsKey(name)) {
                    map.put(data.getId(), datamodelParams.get(name));
                    logger.warn("overwritten @" + name + " with external:" + datamodelParams.get(name));
                    continue;
                }

                Object varObj = null;
                try {
                    varObj = eval.eval(ctx, name);
                } catch (SCXMLExpressionException ex) {
                    logger.fatal(ex);
                }
                value = (varObj != null) ? varObj.toString() : "0";
                logger.debug("\tdata id:" + data.getId() + " with expr=" + data.getExpr() + " changed to:" + varObj);
            } else {
                value = expr.replaceAll("^'", "").replaceAll("'$", "");
            }
            logger.debug("\tparameter " + data.getId() + "='" + value + "'");
            map.put(data.getId(), value);
        }
        return map;
    }

    /**
     * Fire an event on the SCXML engine.
     *
     * @param event The event name.
     * @return Whether the state machine has reached a &quot;final&quot; configuration.
     */
    public synchronized boolean fireEventFromSkill(final String event) {
        if (!triggerEvents) {
            logger.warn("automatic transitions are disabled:" + event);
            return false;
        }
        TriggerEvent evts = new TriggerEvent(event, TriggerEvent.SIGNAL_EVENT);
        try {
            logger.debug("FIRE SKILL Event: " + event);
            logger.trace("All Current Active states:");
            if (logger.isTraceEnabled()) for(EnterableState s : scxmlExecutor.getStatus().getActiveStates()) {
                if (s instanceof State) {
                    State state = (State) s;
                    logger.trace("- " + state.getId());
                } else if (s instanceof Parallel) {
                    Parallel state = (Parallel) s;
                    logger.trace("- (parallel) " + state.getId());
                } else {
                    logger.trace("- (?) s.getId()");
                }

            }
            //checkEventTransitions(event);
            scxmlExecutor.triggerEvent(evts);
        } catch (ModelException me) {
            logger.error("Error while fireing an event", me);
            logger.error(me.getMessage());
        }
        return scxmlExecutor.getStatus().isFinal();
    }

    public boolean fireEvent(final String event) {
        TriggerEvent evts = new TriggerEvent(event, TriggerEvent.SIGNAL_EVENT);
        try {
            logger.debug("FIRE Event: " + event);
            //checkEventTransitions(event);
            scxmlExecutor.triggerEvent(evts);
        } catch (ModelException me) {
            logger.error("Error while fireing an event", me);
            logger.error(me.getMessage());
        }
        return scxmlExecutor.getStatus().isFinal();
    }

    /**
     * Invoke the corresponding class of a state (same name).
     *
     * @param state
     * @param data
     * @return True. if invoke was successful.
     */
    protected boolean invoke(final StateID state, Map<String, String> data) {
        logger.trace("Invoking state: " + state.getFullID());
        logger.info("INVOKE ### " + state.getCanonicalID());

        String shortID = state.getCanonicalSkill();
        try {
            Class<?> c = Class.forName(state.getFullSkill());

            Constructor<?>[] constrs = c.getConstructors();
            Constructor<?> aConstructor = constrs[0];

            // Create Skill
            AbstractSkill skill;
            skill = (AbstractSkill) aConstructor.newInstance();

            // Create Skill Runner
            logger.trace("Invoking skill: " + state.getFullSkill());
            SCXMLSkillRunner runner = new SCXMLSkillRunner(this, skill, state, data,
                    configurator.getSlotXPathMapping(state));
            activeStates.put(state, runner);

            // Schedule Execution
            skillExecutor.submit(runner);

            return true;
        } catch (InstantiationException e) {
            logger.error("Error instantiating skill " + shortID, e);
        } catch (ClassNotFoundException e) {
            logger.info("No class for skill " + shortID);
            // logger.error("just assume simple debug skill/state");
            return true;
        } catch (IllegalArgumentException e) {
            logger.error("Illegal argument for skill " + shortID, e);
        } catch (IllegalAccessException e) {
            logger.error("Illegal access to skill " + shortID, e);
        } catch (InvocationTargetException e) {
            logger.error("Error invoking skill " + shortID, e);
        } catch (SkillConfigurationException e) {
            logger.error("Error configuring skill " + shortID, e);
        }
        return false;
    }

    /**
     * Starts the state machine.
     */
    public synchronized void startMachine() {
        if (!isInitialized) {
            throw new StateMachineException("State Machine was "
                    + "not successfully initialized");
        }
        if (isRunning()) {
            stopMachine();
        }

        try {
            logger.info("\n#######################\nSTARTING STATE MACHINE\n#######################");
            running = true;
            // Set listeners
            for (SCXMLListener listener : listeners) {

                if (listener instanceof StateChangePublisher) {
                    StateChangePublisher scp = (StateChangePublisher) listener;
                    try {
                        scp.publish("", scxml.getInitial(), "start");
                    } catch (NullPointerException e) {
                        scp.publish("", scxml.getInitial(), "start");
                    }
                }
                scxmlExecutor.addListener(scxml, listener);
            }
            scxmlExecutor.go();
            activeStates.sendCurrentStates();
        } catch (ModelException me) {
            logger.error("Error starting state machine", me);
            throw new StateMachineException("Error starting state machine", me);
        }

    }

    /**
     * Pause the state machine.
     */
    public synchronized void pauseMachine() {
        logger.info("PAUSE STATE MACHINE");
        PAUSE = true;
        Set<StateID> keys = new HashSet<>(activeStates.keySet());
        for (StateID key : keys) {
            activeStates.get(key).setPause(PAUSE);
        }
    }

    /**
     * Stop and reset the state machine.
     */
    public synchronized void stopMachine() {
        logger.info("STOP STATE MACHINE");
        running = false;

        if (scxmlExecutor!=null) {
            scxmlExecutor.removeListener(scxml, this);
            for (SCXMLListener listener : listeners) {

                if (listener instanceof StateChangePublisher) {
                    StateChangePublisher scp = (StateChangePublisher) listener;
                    scp.publish("unknown", "", "cancel");
                }
                scxmlExecutor.removeListener(scxml, listener);
            }
        }

        Set<StateID> keys = new HashSet<>(activeStates.keySet());
        for (StateID key : keys) {
            stopAndRemoveState(key, false);
        }

        activeStates.clear();

        try {
            setupEngine(scxml);
        } catch (ModelException e) {
            logger.fatal("Could not setup engine during stop");
            throw new RuntimeException(e);
        }

        PAUSE = false;
        logger.info("\n#######################\nSTATE MACHINE STOPPED AND RESET\n#######################");

    }

    public synchronized void unloadBonsai() {
        BonsaiManager.getInstance().cleanUp();
    }

    /**
     * Continue the state machine.
     */
    public synchronized void continueStateMachine() {
        logger.info("CONTINUE STATE MACHINE");
        PAUSE = false;
        Set<StateID> keys = new HashSet<>(activeStates.keySet());
        for (StateID key : keys) {
            activeStates.get(key).setPause(PAUSE);
        }
    }

    public synchronized boolean isRunning() {
        if (!activeStates.isEmpty()) {
            running = true;
            return true;
        } else {
            running = false;
            return false;
        }
    }

    public boolean isInitialized() {
        return isInitialized;
    }

    private void actionCheck(List<Action> actions) {
        //logger.trace("ACTIONCHECK");
        actions.stream().forEach((a) -> {
            if (a instanceof Send) {
                logger.debug("\t\tSEND ## Event:"
                        + ((Send) a).getEvent());
                //Somehow we dont always execute event actions and fire events?
                //So we just fire manually
                //fireEvent(((Send) a).getEvent());
                //checkEventTransitions(((Send) a).getEvent());
            } else if (a instanceof Assign) {
                Assign action = (Assign) a;
                if(action.getExpr().startsWith("'")) {
                    logger.debug("\t\tASSIGN ## Name:" + action + " Expr:" + action.getExpr());
                } else {
                    logger.warn("\t\tASSIGN ## Name:" + action + " VALUE OF:'" + action.getExpr()+ "'");
                }

            }
        }); //logger.trace("possible actions: " + actionsStr);
    }

    /**
     * Invoke the corresponding class of a state.
     * <p>
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public void onEntry(final EnterableState entered) {

        logger.debug("\tOnEntry: " + entered.getId());
        logger.trace("All Current states:");
        if (logger.isTraceEnabled()) {
            if (scxmlExecutor.getStatus().getStates().isEmpty()) {
                logger.trace(" -- NONE --");
            }
            for(EnterableState s : scxmlExecutor.getStatus().getStates()) {
                logger.trace("- " + s.getId());
            }
        }
        actionCheck(entered.getOnEntries().stream().map(it -> it.getActions()).flatMap(List::stream).collect(Collectors.toList()));

        while (PAUSE && running) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                logger.error("Interrupted while sleeping on pause");
                Thread.currentThread().interrupt();
            }
        }

        // Invoke state
        if (entered instanceof State) {
            State toEnter = (State) entered;
            Map<String, String> data = getVariables(toEnter.getDatamodel());

            try {

                StateID state = new StateID(config.statePrefix, entered.getId());

                if (entered instanceof Final | isEndState(state.getCanonicalSkill())) {
                    running = false;
                    logger.debug("\tOnEntry: entered final State");
                }

                // Is state a compound state (with substates)?
                if (toEnter.getChildren().isEmpty() && !isEndState(state.getCanonicalSkill())) {
                    boolean isStateRunning = invoke(state, data);

                    // stop system if state was not invoked successfully
                    if (!isStateRunning) {
                        System.exit(-1);
                    }
                }
            } catch (StateIDException e) {
                logger.error("Malformatted id string (this should "
                        + "have been checked by validator)", e);
                running = false;
            }
        }
    }

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    @Override
    public void onExit(final EnterableState exited) {
        //logger.trace("Called exit for: " + exited.getId());

        logger.debug("\tOnExit: " + exited.getId());
        actionCheck(exited.getOnExits().stream().map(it -> it.getActions()).flatMap(List::stream).collect(Collectors.toList()));

        try {

            // Remove exited state from active states hash map and stop it if
            // neccessary
//        if (exited instanceof State) {
//            logger.trace("exited is state");
//            State state = (State) exited;
//            for (Object childs : state.getChildren().keySet()) {
//                logger.info("key:" + childs + " value:"
//                        + state.getChildren().get(childs));
//            }
//        }
            if (exited instanceof Parallel) {
                Parallel parallel = (Parallel) exited;
                logger.trace("exited is instance of parallel " + exited.getId());
                this.pauseMachine();
                for (Object s : parallel.getChildren()) {
                    if (s instanceof TransitionTarget) {
                        TransitionTarget t = (TransitionTarget) s;

                        StateID stateId = new StateID(config.statePrefix, t.getId());
                        stopAndRemoveState(stateId, true);
                    }
                }
                // Removing all active states to be sure
                Set<StateID> keys = new HashSet<>(activeStates.keySet());
                for (StateID key : keys) {
                    stopAndRemoveState(key, true);
                }
                this.continueStateMachine();
            } else {
                logger.trace("exited is not parallel " + exited.getId() + " "
                        + exited.getClass().getSimpleName());
                StateID stateId = new StateID(config.statePrefix, exited.getId());
                stopAndRemoveState(stateId, false);
            }
        } catch (StateIDException e) {
            logger.error("Malformatted id: " + e.getMessage());
        }
    }


    /**
     * {@inheritDoc}
     *
     * @param from
     * @param to
     * @param transition
     */
    @Override
    public void onTransition(TransitionTarget from, TransitionTarget to, Transition transition, String event) {
        // Lets have a look for payload (deprecated)
        payload = scxmlExecutor.getRootContext().get("_eventdata");
        if (payload != null) {
            logger.debug("Payload detected: " + payload.getClass().getSimpleName());
        }

        logger.info("\tonTransition: \"" + from.getId() + "\" --> \"" + to.getId()
                + " \"event: \"" + event + "\"");

        actionCheck(transition.getActions());

    }

    private boolean isEndState(String s) {
        if (!config.customFinalStates) return false;
        return s.equals("End") || s.equals("Fatal");
    }

    /**
     * Use this method to stop a running state/skill and remove it from the active states hash map. If no state/skill
     * with the given ID is running nothing will happen.
     *
     * @param id         ID of the state to be stopped.
     * @param inParallel <code>true</code> if the skill is inside parallel.
     * @see SkillStateMachine#activeStates
     */
    private void stopAndRemoveState(StateID id, boolean inParallel) {
        logger.trace("Stop and Remove State " + id.getCanonicalID());
        // Check if state is corrupt
        if (corruptStates.containsKey(id)) {
            logger.info("Not waiting for corrupt state/class: " + id);
            corruptStates.remove(id);
            activeStates.remove(id);
        } else {
            if (activeStates.containsKey(id)) {
                SCXMLSkillRunner stateToEnd = activeStates.get(id);
                if (!stateToEnd.hasRunnerBeenExecuted()) {
                    logger.info("Waiting for state/class to end2: " + id);

                    // TODO: sending events should not be necessary here, but
                    // I am not completely sure what sideeffects this may have
                    stateToEnd.forceEnd(false);
                    // old: stateToEnd.forceEnd(!inParallel);
                }
                activeStates.remove(id);
            }
        }
    }

    /**
     * Returns a list of all available States including Parallel.
     *
     * @return
     */
    public LinkedList<TransitionTarget> getTransitionTargets() {
        LinkedList<TransitionTarget> list = new LinkedList<>();
        if (scxml != null) {
            Map<String, TransitionTarget> allTargets = scxml.getTargets();
            if (allTargets != null) allTargets.forEach((k, v) -> list.add(v));
        }
        return list;
    }

    /**
     * Returns a list of currently possible events.
     *
     * @return List of Strings with names of the possible events
     */
    public LinkedList<String> getEventList() {
        LinkedList<String> list = new LinkedList<>();
        if (scxmlExecutor.getStatus().getActiveStates().iterator().hasNext()) {
            @SuppressWarnings("unchecked")
            List<Transition> a = ((State) scxmlExecutor.getStatus()
                    .getActiveStates().iterator().next()).getTransitionsList();
            for (Transition anA : a) {
                String aString = anA.getEvent();
                list.push(aString);
            }
        }
        return list;
    }

    /**
     * Get Set of current scxml States
     * @return
     */
    public Set<String> getCurrentTransitionTargets() {
        Set<String> list = new HashSet<>();
        Set a = scxmlExecutor.getStatus().getStates();
        a.stream().filter((so) -> so instanceof TransitionTarget).forEach((so) -> {
            TransitionTarget s = (TransitionTarget) so;
            list.add(s.getId());
        });
        return list;
    }

    public List<Transition> getPossibleTransitions() {
        LinkedList<Transition> list = new LinkedList<>();
        try {
            Set a = scxmlExecutor.getStatus().getStates();
            a.stream().filter((so) -> so instanceof State).forEach((so) -> {
                State s = (State) so;
                List b = s.getTransitionsList();
                b.stream().filter((to) -> to instanceof Transition).forEach((to) -> {
                    Transition t = (Transition) to;
                    list.add(t);
                });
            });

        } catch (NullPointerException e) {
            //logger.debug("failed, getPossible transitions");
        }

        return list;
    }

    public List<BonsaiTransition> getCurrentPossibleTransitions() {
        List<BonsaiTransition> transitions = new LinkedList<>();
        List<Transition> rawTransitions = getPossibleTransitions();
        for (Transition t : rawTransitions) {
            BonsaiTransition trans = BonsaiTransition.of(t);
            transitions.add(trans);
        }
        return transitions;
    }

    public List<BonsaiTransition> getTransitionsByState(String name) {
        List<BonsaiTransition> transitions = new LinkedList<>();

        EnterableState target = scxmlExecutor.getStatus().getStates().stream().filter(it -> it.getId().equals(name)).findFirst().orElse(null);

        if (target != null) do {
            if (target instanceof TransitionalState) {
                final TransitionalState ts = (TransitionalState) target;
                final String targetId = target.getId();
                ts.getTransitionsList().forEach(it -> {
                    BonsaiTransition t = BonsaiTransition.of((Transition) it);
                    t.setFrom(targetId);
                    transitions.add(t);
                });
            }
        } while ((target = target.getParent()) != null);
        else {
            logger.fatal("State not found " + name);
            scxmlExecutor.getStatus().getStates().stream().forEach(it -> logger.fatal(it.getId()));
        }

        return transitions;
    }

    /**
     * Returns the payload of the last transition.
     *
     * @return Payload of the last transition or null, if no payload was attached.
     */
    public Object getPayload() {
        return payload;
    }

    /**
     * Add a listener to the document root.
     *
     * @param listener SCXMLListener to be added.
     */
    public void addListener(SCXMLListener listener) {
        listeners.add(listener);
        if (scxmlExecutor != null) {
            scxmlExecutor.addListener(scxml, listener);
        }
    }

    /**
     * {@link SCXML} representation of this state machine.
     *
     * @return {@link SCXML} representation of this state machine.
     */
    public SCXML getSCXML() {
        return scxml;
    }

    /**
     * @param scxml the scxml to set
     */
    public void setScxml(SCXML scxml) {
        this.scxml = scxml;
        try {
            scxmlExecutor.setStateMachine(scxml);
        } catch (ModelException e) {
            throw new RuntimeException(e);
        }
    }

    public Set<String> getRequestedSensorNames() {
        return configurator.getRequestedSensors().keySet();
    }

    public Set<String> getRequestedActuatorNames() {
        return configurator.getRequestedActuators().keySet();
    }

    public void addExceptionHandler(SkillExceptionHandler handler) {
        exceptionHandlers.add(handler);
    }

    @Override
    public void handle(Throwable e) {
        synchronized (exceptions) {
            logger.error("Caught skill execution exception: ", e);
            exceptions.add(e);
            for (SkillExceptionHandler handler : exceptionHandlers) {
                handler.handle(e);
            }
            while (exceptions.size() > MAX_EXCEPTION_HISTORY) {
                exceptions.pop();
            }
        }
    }

    public boolean hasExceptions() {
        synchronized (exceptions) {
            return !exceptions.isEmpty();
        }
    }

    public List<Throwable> getSkillExceptions() {
        synchronized (exceptions) {
            return exceptions;
        }
    }

    /**
     * Tell state machine that something went wrong with a state.
     *
     * @param id     State ID of the corrupt state.
     * @param runner Skill runner that runs the state.
     */
    public void announceCorruptState(StateID id, SCXMLSkillRunner runner) {
        corruptStates.put(id, runner);
    }

    public void addAditionalPermanentSensors(Map<String, Class<?>> rs) {
        additionalPermanentSensors.putAll(rs);
        logger.debug("additional permanent Sensors: " + rs.toString());
    }

    public List<String> getActiveStates() {
        List<String> list = new LinkedList<>();
        activeStates.keySet().stream().forEach((i) -> {
            list.add(i.getCanonicalID());
        });
        return list;
    }

    private void addActiveState(StateID state, SCXMLSkillRunner runner) {
        activeStates.put(state, runner);
    }
}
