package de.unibi.citec.clf.bonsai.engine.scxml.config;


import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.bonsai.engine.SkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.scxml.SkillConfigFaults;
import de.unibi.citec.clf.bonsai.util.helper.ListClass;
import org.apache.commons.scxml.model.*;
import org.apache.log4j.Logger;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.NodeList;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.*;

/**
 * This class collects the sensor and actuator requests from all skills used in
 * the state machine definition. It handles the requests by trying to
 * instantiate the sensors and actuators and offers them to clients in order to
 * pass them back to the skills in the state configuration phase.
 *
 * @author lziegler
 * @author lkettenb
 */
public class StateMachineConfigurator {

    private Map<StateID, Map<String, String>> stateIDXPathMapping = new HashMap<>();

    public Map<String, String> getSlotXPathMapping(StateID state) {
        return stateIDXPathMapping.get(state);
    }


    private static final Logger logger = Logger.getLogger(StateMachineConfigurator.class);
    /**
     * Hash map containing all actuators.
     */
    private final Map<String, Class<? extends Actuator>> requestedActuatorMap = new HashMap<>();
    /**
     * Hash map containing all sensors.
     */
    private final Map<String, Class<?>> requestedSensorMap = new HashMap<>();

    @SuppressWarnings("rawtypes")
    private final Map<String, ListClass> requestedListSensorMap = new HashMap<>();
    /**
     * Hash map containing all sensors.
     */
    private final Set<String> requestedWorkingMemories = new HashSet<>();

    private final Map<StateID, Set<ExitToken>> registeredExitTokens = new HashMap<>();
    /**
     * Hash map containing all slots.
     */
    private final Map<String, Map<String, String>> stateSlotXPathMapping = new HashMap<>();
    private final String prefix;
    // TODO: Revise this! Skills should request working memory.
    public final static String WORKING_MEMORY_NAME = "WorkingMemory";

    public StateMachineConfigurator(String prefix) {
        this.prefix = prefix;
        logger.info("CREATING NEW STATE MACHINE CONFIGURATOR");
    }

    /**
     * Read and overwrite (if necessary) the slot default XPaths with XPaths
     * from state machine file.
     *
     * @param scxml
     */
    private synchronized StateMachineConfiguratorResults readSlotXPathsFromStateMachine(SCXML scxml) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();
        @SuppressWarnings("unchecked")
        Map<String, TransitionTarget> targets = scxml.getTargets();
        @SuppressWarnings("unchecked")
        List<Data> dataList = (scxml.getDatamodel() != null) ? scxml.getDatamodel().getData() : new LinkedList<>();
        for (Data d : dataList) {
            // Look for slots
            if (d.getId().equals("#_SLOTS")) {
                NodeList children = d.getNode().getChildNodes();
                NodeList slotNodes = children.item(0).getChildNodes();
                for (int i = 0; i < slotNodes.getLength(); ++i) {
                    NamedNodeMap attr = slotNodes.item(i).getAttributes();
                    String slotKey = attr.getNamedItem("key").getNodeValue();
                    String state = attr.getNamedItem("state").getNodeValue();
                    String fullstate = prefix;
                    if (prefix.endsWith(".")) {
                        fullstate += state;
                    } else {
                        fullstate += "." + state;
                    }
                    String slotXpath = attr.getNamedItem("xpath").getNodeValue();

                    boolean foundTraget = false;
                    if(state.contains("*")) {
                        String idRegex = state.replace(".", "\\.");
                        idRegex = idRegex.replace("*", ".*");
                        for (String target : targets.keySet()) {
                            if (target.matches(idRegex)) {
                                foundTraget = true;
                                break;
                            }
                        }
                    } else {
                        foundTraget = targets.containsKey(state);
                    }


                    if (!foundTraget) {
                        String msg = "Slot definition '" + slotKey + "' for unknown state '" + state + "'.";
                        logger.error(msg);
                        results.add(new SkillConfigFaults(StateID.getUnknownState(), msg));
                        continue;
                    }

                    logger.trace("Set XPath '" + slotXpath + "' for slot '" + slotKey + "' in state '" + state + "'.");
                    if (!stateSlotXPathMapping.containsKey(fullstate)) {
                        stateSlotXPathMapping.put(fullstate, new HashMap<>());
                    }
                    stateSlotXPathMapping.get(fullstate).put(slotKey, slotXpath);

                }
            }
        }
        // print slot-XPath mapping
        logger.debug("### STATE-SLOT-XPATH MAPPING ###");
        for (String stateID : stateSlotXPathMapping.keySet()) {
            logger.debug("Mapping for state: " + stateID);
            for (String slot : stateSlotXPathMapping.get(stateID).keySet()) {
                logger.debug(" - " + slot + " : " + stateSlotXPathMapping.get(stateID).get(slot));
            }
        }
        logger.debug("################################");
        return results;
    }

    public synchronized StateMachineConfiguratorResults configureSlotsOnly(SCXML scxml) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();

        List<Data> dataList = (scxml.getDatamodel() != null) ? scxml.getDatamodel().getData() : new LinkedList<>();
        for (Data d : dataList) {
            // Look for slots
            if (d.getId().equals("#_SLOTS")) {

                NodeList children = d.getNode().getChildNodes();
                NodeList slotNodes = children.item(0).getChildNodes();

                for (int i = 0; i < slotNodes.getLength(); ++i) {
                    NamedNodeMap attr = slotNodes.item(i).getAttributes();
                    String slotKey = attr.getNamedItem("key").getNodeValue();
                    String state = attr.getNamedItem("state").getNodeValue();
                    String fullstate = prefix;
                    if (prefix.endsWith(".")) {
                        fullstate += state;
                    } else {
                        fullstate += "." + state;
                    }
                    String slotXpath = attr.getNamedItem("xpath").getNodeValue();

                    logger.trace("Set XPath '" + slotXpath + "' for slot '" + slotKey + "' in state '" + state + "'.");
                    if (!stateSlotXPathMapping.containsKey(fullstate)) {
                        stateSlotXPathMapping.put(fullstate, new HashMap<>());
                    }
                    stateSlotXPathMapping.get(fullstate).put(slotKey, slotXpath);
                }
            }
        }
        for(String state : stateSlotXPathMapping.keySet()) {
            try {
                stateIDXPathMapping.put(new StateID(state), stateSlotXPathMapping.get(state));
            } catch (StateIDException e) {
                logger.fatal(e);
            }
        }


        // print slot-XPath mapping
        logger.debug("### STATE-SLOT-XPATH MAPPING ###");
        for (String stateID : stateSlotXPathMapping.keySet()) {
            logger.debug("Mapping for state: " + stateID);
            for (String slot : stateSlotXPathMapping.get(stateID).keySet()) {
                logger.debug(" - " + slot + " : " + stateSlotXPathMapping.get(stateID).get(slot));
            }
        }

        return results;
    }

    public synchronized StateMachineConfiguratorResults configureSkills(SCXML scxml, boolean generateDefaultSlots) throws StateIDException {
        @SuppressWarnings("unchecked")
        Map<String, TransitionTarget> map = scxml.getTargets();

        Map<String, String> globals = createGlobalVars(scxml);

        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();
        StateMachineConfiguratorResults slotResults = readSlotXPathsFromStateMachine(scxml);
        results.merge(slotResults);

        for (String id : map.keySet()) {
            if (map.get(id) instanceof Parallel) {
                logger.debug("... is instance of parallel.");
                continue;
            }
            if (!(map.get(id) instanceof State)) {
                logger.debug("... is no child of State.");
                continue;
            }
            State currentState = (State) map.get(id);
            if (!currentState.isSimple()) {
                logger.debug("... is not a simple state.");
                continue;
            }

            StateID idState = new StateID(prefix, id);

            StateMachineConfiguratorResults skillResults = configureSkill(idState, currentState, globals, generateDefaultSlots);
            results.merge(skillResults);
        }

        logger.info("configured " + map.size() + " skills with " + results.numErrors() + " errors");

        return results;
    }

    private Map<String, String> createGlobalVars(SCXML scxml) {
        Map<String, String> vars = new HashMap<String, String>();

        for (Object a : scxml.getDatamodel().getData()) {
            if (!(a instanceof Data)) {
                logger.fatal("Data is no Data, PANIC!");
                continue;
            }

            Data d = (Data) a;

            if (d.getId().equalsIgnoreCase("#_SLOTS")) {
                continue;
            }

            if (d.getExpr() == null) {
                logger.warn("Data " + d.getId() + " has no expr");
                if (vars.containsKey(d.getId())) {
                    logger.info("but entry exists, skipped ");
                } else {
                    vars.put(d.getId(), "");
                }
            } else {
                vars.put(d.getId(), d.getExpr().replaceAll("'", ""));
            }
        }

        return vars;
    }

    // TODO: change Exception
    public synchronized List<MissingSlotFault> testOrAddSlotXPathMapping(StateID state, Set<String> slotKey, boolean addDefaults) {
        List<MissingSlotFault> errors = new ArrayList<>();
        if (stateIDXPathMapping.containsKey(state)) {
            return errors;// stateIDXPathMapping.get(state);
        }
        Map<String, String> result = new HashMap<>();
        for (String key : slotKey) {
            String matching = null;
            String fid = state.getFullID();
            // fetch match
            if(stateSlotXPathMapping.containsKey(fid) && stateSlotXPathMapping.get(fid).containsKey(key)) {
                matching = fid;
            }

            if (matching != null) {
                result.put(key, stateSlotXPathMapping.get(matching).get(key));
                continue;
            }
            // Search with regex
            for (String candidate : stateSlotXPathMapping.keySet()) {
                if (candidate.contains("*")) {
                    String fullIdRegEx = candidate.replace(".", "\\.");
                    fullIdRegEx = fullIdRegEx.replace("*", ".*");
                    if ((state.getFullID().matches(fullIdRegEx))
                            && (stateSlotXPathMapping.get(candidate).containsKey(key))) {
                        matching = candidate;
                        break;
                    }
                }
            }
            if (matching != null) {
                result.put(key, stateSlotXPathMapping.get(matching).get(key));
            } else {
                if (addDefaults) {
                    result.put(key, "/" + key);
                    errors.add(new MissingSlotFault(key, state, false));
                } else {
                    errors.add(new MissingSlotFault(key, state));
                }
            }
        }

        stateIDXPathMapping.put(state, result);
        return errors; // result;

    }

    public synchronized Map<String, Class<?>> getRequestedSensors() {
        return requestedSensorMap;
    }

    @SuppressWarnings("rawtypes")
    public synchronized Map<String, ListClass> getRequestedListSensors() {
        return requestedListSensorMap;
    }

    public synchronized Map<String, Class<? extends Actuator>> getRequestedActuators() {
        return requestedActuatorMap;
    }

    public synchronized Set<String> getRequestedWorkingMemories() {
        // For now we only use one working memory
        requestedWorkingMemories.clear();
        requestedWorkingMemories.add(WORKING_MEMORY_NAME);
        return requestedWorkingMemories;
    }

    public Set<ExitToken> getRegisteredExitTokens(StateID state) {
        return registeredExitTokens.get(state);
    }

    public Map<StateID, Set<ExitToken>> getRegisteredExitTokens() {
        return registeredExitTokens;
    }

    private StateMachineConfiguratorResults configureSkill(StateID id, State state, Map<String, String> globals, boolean generateDefaultSlots) {

        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();

        // process ID string
        logger.debug("configuring state: " + id);

        // create instance of skill
        AbstractSkill aSkill;
        try {
            Class<?> c = Class.forName(id.getFullSkill());

            logger.debug("created class object: " + c);

            Constructor<?>[] constrs = c.getConstructors();
            Constructor<?> aConstructor = constrs[0];

            aSkill = (AbstractSkill) aConstructor.newInstance();

        } catch (InstantiationException e) {

            SkillConfigFaults s = new SkillConfigFaults(id,
                    "Error while configuring a State! Instantiation Error: " + e.getMessage());
            logger.error(s.getErrorMessage(), e);
            results.add(s);
            return results;
        } catch (ClassNotFoundException e) {
            SkillConfigFaults s = new SkillConfigFaults(id,
                    "Error while configuring a State! Class not found: " + e.getMessage());
            logger.error(s.getErrorMessage(), e);
            //results.add(s); //REMOVED DOUBLE ERROR MESSAGE (instantiating and configure)
            return results;
        } catch (IllegalArgumentException e) {
            SkillConfigFaults s = new SkillConfigFaults(id,
                    "Error while configuring a State! Illegal Argument: " + e.getMessage());
            logger.error(s.getErrorMessage(), e);
            results.add(s);
            return results;
        } catch (IllegalAccessException e) {
            SkillConfigFaults s = new SkillConfigFaults(id,
                    "Error while configuring a State! Illegal Access: " + e.getMessage());
            logger.error(s.getErrorMessage(), e);
            results.add(s);
            return results;
        } catch (InvocationTargetException e) {
            SkillConfigFaults s = new SkillConfigFaults(id,
                    "Error while configuring a State! Invocation Target Exception: " + e.getMessage());
            logger.error(s.getErrorMessage(), e);
            results.add(s);
            return results;
        }

        Map<String, String> datamodelVars = readVariables(state.getDatamodel(), globals);
        // create a SkillConfigurator
        SkillConfigurator conf = SkillConfigurator.createConfigPhase(datamodelVars);
        logger.debug("using settings:");
        for (Map.Entry<String, String> a : datamodelVars.entrySet()) {
            logger.debug(" -" + a.getKey() + "=" + a.getValue());
        }

        // receive configuration
        try {
            aSkill.configure(conf);

            results.merge(fetchRequestedActuators(conf.getActuatorRequests(), id));
            results.merge(fetchRequestedSensors(conf.getSensorRequests(), id));
            results.merge(fetchRequestedSlots(conf.getSlotRequests(), id, generateDefaultSlots));

            conf.activateObjectPhase(datamodelVars, null);
            for (String a : conf.getUnusedParams()) {
                results.add(new SkillConfigFaults(id, id + " - unused param: " + a));
            }
            for (ConfigurationException a : conf.getExceptions()) {
                results.add(new SkillConfigFaults(id, id + " - " + a.getMessage()));
            }
        } catch (ConfigurationException e) {
            String error = "Error configuring skill " + id.getCanonicalID() + ": " + e.getMessage();
            logger.fatal(error);
            results.add(new SkillConfigFaults(id, error));
            conf.getExceptions().forEach((ex) -> {
                results.add(new SkillConfigFaults(id, ex.getMessage(),true));
                logger.fatal(ex.getMessage());
            });
        }




        registeredExitTokens.put(id, conf.getRegisteredExitTokens());

        return results;
    }

    private StateMachineConfiguratorResults fetchRequestedSlots(Map<String, Class<?>> requests, StateID stateID, boolean generateDefaults) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();

        List<MissingSlotFault> errors = testOrAddSlotXPathMapping(stateID, requests.keySet(), generateDefaults);
        if (!errors.isEmpty()) {
            for (MissingSlotFault e : errors) {
                SkillConfigFaults smerror = new SkillConfigFaults(stateID, e.getMessage());
                if (e.isError()) {
                    logger.error(e.getMessage());
                    smerror.addNoSlotDefinition(e.getSlotKey());
                } else {
                    logger.warn(e.getMessage());
                    smerror.addDefaultSlotDefinition(e.getSlotKey());
                }
                results.add(smerror);
            }
        }

        return results;
    }

    @SuppressWarnings("unchecked")
    private StateMachineConfiguratorResults fetchRequestedActuators(Map<String, Class<?>> requests, StateID state) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();
        // cycle all requests
        for (String key : requests.keySet()) {
            // check if class implements actuator interface
            Class<? extends Actuator> actClass;

            // Is the class object assignable?
            Class<?> request = requests.get(key);
            if (Actuator.class.isAssignableFrom(request)) {
                actClass = (Class<? extends Actuator>) request;
            } else {
                String error = "Requested actuator class " + request.getName()
                        + " does not implement Actuator interface.";
                logger.warn(error + " Skip!");
                results.add(new SkillConfigFaults(state, error));
                continue;
            }
            requestedActuatorMap.put(key, actClass);
            logger.debug("Created actuator \"" + key + "\" for state " + state);
        }
        return results;
    }

    private StateMachineConfiguratorResults fetchRequestedSensors(Map<String, Class<?>> requests, StateID state) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();
        // cycle all requests
        for (String key : requests.keySet()) {

            requestedSensorMap.put(key, requests.get(key));
            logger.debug("Request sensor \"" + key + "\" for state " + state);

            //results.add(new StateMachineConfigError(state, "Request sensor \"" + key + "\" for state " + state));
        }
        return results;
    }

    @SuppressWarnings("rawtypes")
    private StateMachineConfiguratorResults fetchRequestedListSensors(Map<String, ListClass> requests, StateID state) {
        StateMachineConfiguratorResults results = new StateMachineConfiguratorResults();
        // cycle all requests
        for (String key : requests.keySet()) {
            requestedListSensorMap.put(key, requests.get(key));
            logger.debug("Created sensor \"" + key + "\" for state " + state);
        }
        return results;
    }

    /**
     * Converts {@link Datamodel} into a key-value-map.
     *
     * @param model The input model.
     * @return A {@link Map} containing key-value pairs.
     */
    private Map<String, String> readVariables(Datamodel model, Map<String, String> vars) {

        HashMap<String, String> map = new HashMap<>();
        if (model == null) {
            return map;
        }

        String symbol = "@";

        @SuppressWarnings("unchecked")
        List<Data> dataList = model.getData();
        for (Data data : dataList) {
            String name = data.getExpr().replaceAll("'", "");
            if (name.startsWith(symbol)) {
                name = name.replaceFirst(symbol, "");

                if (vars.containsKey(name)) {
                    map.put(data.getId(), vars.get(name));
                    logger.info("overwritten @" + name + " with external:" + vars.get(name));
                    continue;
                } else {
                    logger.info("variable " + name + " not found in root datamodel");
                }
            } else {
                map.put(data.getId(), data.getExpr().replaceAll("^'", "").replaceAll("'$", ""));
            }
        }
        return map;
    }
}
