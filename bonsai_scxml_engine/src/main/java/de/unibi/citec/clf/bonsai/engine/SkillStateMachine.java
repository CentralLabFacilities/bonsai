package de.unibi.citec.clf.bonsai.engine;


import de.unibi.citec.clf.bonsai.core.BonsaiManager;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationParser;
import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
import de.unibi.citec.clf.bonsai.core.configuration.XmlConfigurationParser;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
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
import org.apache.commons.scxml.*;
import org.apache.commons.scxml.env.SimpleErrorReporter;
import org.apache.commons.scxml.env.SimpleScheduler;
import org.apache.commons.scxml.env.jexl.JexlEvaluator;
import org.apache.commons.scxml.model.*;
import org.apache.log4j.Logger;

import javax.xml.transform.TransformerException;
import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.*;
import java.util.concurrent.*;
import java.util.logging.Level;

/**
 * <p>
 * This class demonstrates one approach for providing the base functionality needed by classes representing stateful
 * entities, whose behaviors are defined via SCXML documents.
 * </p>
 * <p>
 * <p>
 * SCXML documents (more generically, UML state chart diagrams) can be used to define stateful behavior of objects, and
 * Commons SCXML enables developers to use this model directly into the corresponding code artifacts. The resulting
 * artifacts tend to be much simpler, embody a useful separation of concerns and are easier to understand and maintain.
 * As the size of the modeled entity grows, these benefits become more apparent.
 * </p>
 * <p>
 * <p>
 * This approach functions by registering an SCXMLListener that gets notified onentry, and calls the namesake method for
 * each state that has been entered.
 * </p>
 * <p>
 * <p>
 * This class swallows all exceptions only to log them. Developers of subclasses should think of themselves as
 * &quot;component developers&quot; catering to other end users, and therefore ensure that the subclasses are free of
 * <code>ModelException</code>s and the like. Most methods are <code>protected</code> for ease of subclassing.
 * </p>
 * <p>
 * TODO: Special class for sub-statemachine?
 */
public class SkillStateMachine implements SCXMLListener, SkillExceptionHandler {

    private final ScheduledExecutorService aliveScheduler = Executors
            .newScheduledThreadPool(1);
    private ScheduledFuture<?> aliveHandle;

    private List<SCXMLServer> scxmlServers = new ArrayList<>();

    private boolean triggerEvents = true;

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
    private String statePrefix = "de.unibi.citec.clf.bonsai.skills.";
    private boolean showDefaultSlotWarnings = true;
    private boolean generateDefaultSlots = false;
    private boolean enableSkillWarnings = false;
    private boolean configureSkills = true;
    private boolean hashSkillconfigurations = false;
    public static boolean useFullIdForStateInformer = true;

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
                if (useFullIdForStateInformer) {
                    states.add(id.getFullID());
                } else {
                    states.add(id.getCanonicalID());
                }
                transitions.addAll(getTransitionsByState(id.getFullID().replace(statePrefix, "")));
            }

            logger.trace("active states sent:" + states);
            stateMapInformers.forEach(it -> {
                List<BonsaiTransition> ts = transitions;
                if (!it.sendStatesWithTransitions()) {
                    ts = new LinkedList<>();
                }
                try {
                    it.sendCurrentStatesAndTransitions(states, transitions);

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
    private SimpleScheduler simpleScheduler;
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
                String status = "unknown";
                if (isInitialized) {
                    status = "initialized";
                }
                if(isLoading) {
                    status = "loading";
                }
                if (running) {
                    status = "running";
                }
                if (PAUSE && running) {
                    status = "pause";
                }

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

    /**
     * Initialize the state machine. Decodes SCXML task file.
     *
     * @param pathToTask   Path to SCXML task file.
     * @param pathToConfig Path to BonSAI configuration file.
     * @return <code>true</code> on success, <code>false</code> otherwise.
     * @throws de.unibi.citec.clf.bonsai.engine.scxml.exception.StateNotFoundException
     * @throws StateIDException
     * @throws LoadingException
     * @throws javax.xml.transform.TransformerException
     */
    public LoadingResults initalize(String pathToTask, String pathToConfig)
            throws StateNotFoundException, StateIDException, LoadingException, TransformerException {
        isLoading = true;
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

        setupEngine(scxml);
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
        configurator = new StateMachineConfigurator(statePrefix);


        // Check if skills use existing sensors/actuators
        if(configureSkills) {
            StateMachineConfiguratorResults smResults = configurator
                    .configureSkills(scxml, generateDefaultSlots);

            Map<StateID, Set<ExitToken>> registeredTokens
                    = configurator.getRegisteredExitTokens();

            // Check if classes and transitions exist
            validator = new SCXMLValidator(this, statePrefix);
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

            results.statePrefix = statePrefix;
            results.configurationResults = confResults;
            results.stateMachineResults = smResults;
            results.validationResult = scxmlValid;
            results.showDefaultSlotWarnings = showDefaultSlotWarnings;
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
            isLoading = false;
            results.statePrefix = statePrefix;
            results.configurationResults = confResults;
            results.showDefaultSlotWarnings = showDefaultSlotWarnings;
        }

        logger.info("\n#########RESULTS:#########\n" + results.toString());
        if (enableSkillWarnings) {
            logger.info(results.validationResult.getWarnings());
        }

        String a = results.stateMachineResults.generateSlotHint(this.statePrefix, false);
        if (!a.isEmpty()) {
            logger.info("\nHint: Missing the following Slots:\n" + a);
        }
        a = results.validationResult.generateTransitionHints();
        if (!a.isEmpty()) {
            logger.info("\nHint: Missing the following Transitions:\n" + a);
        }

        return results;

    }

    /**
     * Instantiate and initialize the underlying executor instance.
     *
     * @param stateMachine The state machine
     */
    private void setupEngine(final SCXML stateMachine) {
        scxmlExecutor = new SCXMLExecutor();
        // scxmlExecutor.sete
        simpleScheduler = new SimpleScheduler(scxmlExecutor);
        scxmlExecutor.setEventdispatcher(simpleScheduler);
        scxmlExecutor.setErrorReporter(new SimpleErrorReporter());
        scxmlExecutor.setEvaluator(new JexlEvaluator());
        scxmlExecutor.setStateMachine(stateMachine);
        scxmlExecutor.addListener(stateMachine, this);

    }

    /**
     * Analyze the data model and look for special variables like "#_STATE_PREFIX".
     *
     * @see SkillStateMachine#statePrefix
     */
    private void analyzeDatamodel() throws MapReader.KeyNotFound {
        Map<String, String> data = getVariables(scxmlExecutor.getStateMachine()
                .getDatamodel());

        statePrefix = MapReader.readConfigString("#_STATE_PREFIX", statePrefix, data);
        logger.debug("Set state prefix to: " + statePrefix);

        showDefaultSlotWarnings = !MapReader.readConfigBool("#_DISABLE_DEFAULT_SLOT_WARNINGS",
                !showDefaultSlotWarnings, data);
        logger.debug("Set disable_default_slot_warnings to: " + !showDefaultSlotWarnings);

        enableSkillWarnings = MapReader.readConfigBool("#_ENABLE_SKILL_WARNINGS", enableSkillWarnings, data);
        logger.debug("Enable Skill warnings: " + enableSkillWarnings);

        generateDefaultSlots = MapReader.readConfigBool("#_GENERATE_DEFAULT_SLOTS", generateDefaultSlots, data);
        logger.debug("Set generation of default slots to: " + generateDefaultSlots);

        configureSkills = MapReader.readConfigBool("#_CONFIGURE_AND_VALIDATE", configureSkills, data);
        logger.debug("Enable full configuration and validation: " + configureSkills);

        hashSkillconfigurations = MapReader.readConfigBool("#_ENABLE_CONFIG_CACHE", hashSkillconfigurations, data);
        logger.debug("Enable configuration cache: " + hashSkillconfigurations);
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

        Context ctx = scxmlExecutor.getRootContext();
//        for (Object o : ctx.getVars().keySet()) {
//            logger.fatal("key:" + o + " data:" + ctx.getVars().get(o));
//        }
        //State s = (State) tt;
        //ctx.setLocal(tt.getParent()., payload);

        Evaluator eval = scxmlExecutor.getEvaluator();
        String a = "@"; //$ does not work (seems to not replace the $ 

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
            //logger.fatal(name);
            if (name.startsWith(a)) {
                name = name.replaceFirst(a, "");

                if (datamodelParams.containsKey(name)) {
                    map.put(data.getId(), datamodelParams.get(name));
                    logger.info("overwritten @" + name + " with external:" + datamodelParams.get(name));
                    continue;
                }

                Object varObj = null;
                //logger.fatal("evaluating:" + name);
                try {
                    varObj = eval.eval(ctx, name);
                } catch (SCXMLExpressionException ex) {
                    java.util.logging.Logger.getLogger(SkillStateMachine.class.getName()).log(Level.SEVERE, null, ex);
                }
                logger.info("data id:" + data.getId() + " with expr=" + data.getExpr() + "changed to:" + varObj);
                name = (varObj != null) ? varObj.toString() : "0";
                map.put(data.getId(), name);

            } else {
                map.put(data.getId(), expr.replaceAll("^'", "").replaceAll("'$", ""));
            }
        }
        return map;
    }

    /**
     * Fire an event on the SCXML engine.
     *
     * @param event The event name.
     * @return Whether the state machine has reached a &quot;final&quot; configuration.
     */
    public boolean fireEventFromSkill(final String event) {
        if (!triggerEvents) {
            logger.warn("automatic transitions are disabled:" + event);
            return false;
        }
        TriggerEvent evts = new TriggerEvent(event, TriggerEvent.SIGNAL_EVENT);
        try {
            logger.debug("FIRE SKILL Event: " + event);
            //checkEventTransitions(event);
            scxmlExecutor.triggerEvent(evts);
        } catch (ModelException me) {
            logger.error("Error while fireing an event", me);
            logger.error(me.getMessage());
        }
        return scxmlExecutor.getCurrentStatus().isFinal();
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
        return scxmlExecutor.getCurrentStatus().isFinal();
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
        logger.info("##INVOKE   " + state.getCanonicalID());

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
            logger.info("\n#######################\nSTARTING STATE MACHINE\n#######################\n");
            running = true;
            // Set listeners
            for (SCXMLListener listener : listeners) {

                if (listener instanceof StateChangePublisher) {
                    StateChangePublisher scp = (StateChangePublisher) listener;
                    try {
                        scp.publish("", scxml.getInitialTarget().getId(), "start");
                    } catch (NullPointerException e) {
                        scp.publish("", scxml.getInitial(), "start");
                    }
                }
                scxmlExecutor.addListener(scxml, listener);
            }
            scxmlExecutor.go();
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

        scxmlExecutor.removeListener(scxml, this);
        for (SCXMLListener listener : listeners) {

            if (listener instanceof StateChangePublisher) {
                StateChangePublisher scp = (StateChangePublisher) listener;
                scp.publish("unknown", "", "cancel");
            }
            scxmlExecutor.removeListener(scxml, listener);
        }
        Set<StateID> keys = new HashSet<>(activeStates.keySet());
        for (StateID key : keys) {
            stopAndRemoveState(key, false);
        }

        activeStates.clear();

        setupEngine(scxml);

        PAUSE = false;
        logger.info("#######################\nSTATE MACHINE STOPPED AND RESET\n#######################\n");

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

    private void actionCheck(List<Action> actions) {
        //logger.trace("ACTIONCHECK");
        actions.stream().forEach((a) -> {
            if (a instanceof Send) {
                logger.info("## SEND ## Event:"
                        + ((Send) a).getEvent());
                //checkEventTransitions(((Send) a).getEvent());
            } else if (a instanceof Assign) {
                Assign action = (Assign) a;
                if(action.getExpr().startsWith("'")) {
                    logger.info("## ASSIGN ## Name:" + action.getName() + " Expr:" + action.getExpr());
                } else {
                    Context ctx = scxmlExecutor.getRootContext();
                    Evaluator eval = scxmlExecutor.getEvaluator();
                    try {
                        logger.warn("## ASSIGN ## Name:" + action.getName() + " VALUE OF:'" + action.getExpr()+ "' = " + eval.eval(ctx,action.getExpr()));
                    } catch (SCXMLExpressionException e) {
                        logger.warn("## ASSIGN ## Name:" + action.getName() + " VALUE OF:'" + action.getExpr()+ "' = NULL");
                    }
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
    public void onEntry(final TransitionTarget entered) {

        logger.debug("#OnEntry: " + entered.getId());
        actionCheck(entered.getOnEntry().getActions());

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

                StateID state = new StateID(statePrefix, entered.getId());

                if (toEnter.isFinal() || isEndState(state.getCanonicalSkill())) {
                    running = false;
                    logger.debug("#OnEntry: entered final State");
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
    public void onExit(final TransitionTarget exited) {
        //logger.trace("Called exit for: " + exited.getId());

        logger.debug("#OnExit: " + exited.getId());
        actionCheck(exited.getOnExit().getActions());

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
                for (Object s : parallel.getChildren()) {
                    if (s instanceof TransitionTarget) {
                        TransitionTarget t = (TransitionTarget) s;
                        StateID stateId = new StateID(statePrefix, t.getId());
                        stopAndRemoveState(stateId, true);
                    }
                }
            } else {
                logger.trace("exited is not parallel " + exited.getId() + " "
                        + exited.getClass().getSimpleName());
                StateID stateId = new StateID(statePrefix, exited.getId());
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
    public void onTransition(final TransitionTarget from,
                             final TransitionTarget to, final Transition transition) {
        // Lets have a look for payload (deprecated)
        payload = scxmlExecutor.getRootContext().get("_eventdata");
        if (payload != null) {
            logger.debug("Payload detected: " + payload.getClass().getSimpleName());
        }

        logger.info("#onTransition: \"" + from.getId() + "\" --> \"" + to.getId()
                + " \"event: \"" + transition.getEvent() + "\"");

        actionCheck(transition.getActions());

    }

    private boolean isEndState(String s) {
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
                    logger.info("Waiting for state/class to end: " + id);

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
        if (scxmlExecutor.getCurrentStatus().getStates().iterator().hasNext()) {
            @SuppressWarnings("unchecked")
            List<Transition> a = ((State) scxmlExecutor.getCurrentStatus()
                    .getStates().iterator().next()).getTransitionsList();
            for (Transition anA : a) {
                String aString = anA.getEvent();
                list.push(aString);
            }
        }
        return list;
    }

    public List<Transition> getPossibleTransitions() {
        LinkedList<Transition> list = new LinkedList<>();
        try {
            Set a = scxmlExecutor.getCurrentStatus().getAllStates();
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

    public List<BonsaiTransition> getTransitionsByState(String name) {
        List<BonsaiTransition> transitions = new LinkedList<>();

        final Map<String, TransitionTarget> targets = scxmlExecutor.getStateMachine().getTargets();

        TransitionTarget target = targets.get(name);

        if (target != null) do {

            final String targetId = target.getId();
            target.getTransitionsList().forEach(it -> {
                    BonsaiTransition t = BonsaiTransition.of((Transition) it);
                    t.setFrom(targetId);
                    transitions.add(t);
                });

        } while ((target = target.getParent()) != null);
        else {
            logger.fatal("State not found " + name + ", states:");
            targets.keySet().forEach(it -> logger.info(it));
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
