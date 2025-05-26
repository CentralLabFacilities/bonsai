package de.unibi.citec.clf.bonsai.engine;


import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.scxml.config.TransitionError;
import de.unibi.citec.clf.bonsai.engine.scxml.config.ValidationResult;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.StateNotFoundException;
import nu.xom.*;
import org.apache.commons.scxml.model.*;
import org.apache.log4j.Logger;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.XMLReaderFactory;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Class containing methods for SCXML validation.
 *
 * @author nkoester
 * @author lkettenb
 */
public class SCXMLValidator {

    private static Logger logger = Logger.getLogger(SCXMLValidator.class);

    SkillStateMachine machine;
    String prefix;

    /**
     * Constructor.
     */
    public SCXMLValidator(SkillStateMachine maschine, String prefix) {
        this.machine = maschine;
        this.prefix = prefix;
    }

    /**
     * Validates a given SCXML based on the availability of the named skill states.
     *
     * @param aSCXML a already parsed and decoded SCXML
     * @return true for a validate SCXML; false for an invalidate SCXML
     * @throws StateIDException Is thrown if a prefix or state id is malformed.
     */
    public ValidationResult validateSCXML(SCXML aSCXML) throws StateNotFoundException,
            StateIDException {
        Map<StateID, Set<ExitToken>> emptyTokens = new HashMap<>();
        return validateAll(aSCXML, emptyTokens, true, false, false);
    }

    public ValidationResult validateTransitions(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens) throws StateIDException, StateNotFoundException {
        return validateAll(aSCXML, tokens, false, true, true);
    }

    public ValidationResult validate(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens) throws StateIDException, StateNotFoundException {
        return validateAll(aSCXML, tokens, true, true, true);
    }

    public static boolean hasDuplicates(InputSource is)
            throws ValidityException, ParsingException, IOException,
            SAXException {
        XMLReader reader = XMLReaderFactory.createXMLReader();
        Builder b = new Builder(reader);

        Document doc = b.build(is.getCharacterStream());

        XPathContext context = new XPathContext("ns", doc.getRootElement()
                .getNamespaceURI());

        Vector<String> ids = new Vector<>();
        Nodes stateNodes = doc.query("//ns:state", context);
        for (int i = 0; i < stateNodes.size(); i++) {
            Node data = stateNodes.get(i);
            if (data instanceof Element) {
                Element elem = (Element) data;
                Attribute att = elem.getAttribute("id");
                if (att != null) {
                    String id = att.getValue();
                    if (ids.contains(id)) {
                        logger.error("DUPLICATE STATE ID: " + id);
                        return true;
                    } else {
                        ids.add(id);
                    }
                }
            }
        }

        logger.debug("checked " + ids.size() + " states. No duplicates!");

        return false;
    }

    private ValidationResult validateAll(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens, boolean vExistance, boolean vTransition, boolean vSends) throws StateNotFoundException,
            StateIDException {

        @SuppressWarnings("unchecked")
        Map<String, TransitionTarget> map = aSCXML.getTargets();

        ValidationResult results = new ValidationResult();

        if(vSends) results.transitionNotFoundException.addAll(findMissingSendTransitions(aSCXML));

        boolean isValid = results.transitionNotFoundException.isEmpty();

        // Set<StateID> unreachedStates = unreachedStates(aSCXML);
        results.unreachedStates = unreachedStates(aSCXML);

        for (String id : map.keySet()) {

            logger.debug("Found TransitionTarget: " + id);
            if (map.get(id) instanceof Parallel) {
                logger.debug("... is instance of parallel.");
                continue;
            }

            if (map.get(id) instanceof State) {
                State currentState = (State) map.get(id);
                if (!currentState.isSimple()) {
                    logger.debug("... is not a simple state.");
                    continue;
                }
                StateID state = new StateID(prefix, id);
                // if state does not exist, no need to check transitions
                try {
                    if (vExistance) {
                        isValid &= validateExistance(state);
                    }
                    if (vTransition) {
                        List<TransitionError> e = validateTransitions(state, currentState, tokens.get(state));
                        for (TransitionError t : e) {
                            if (t.type == de.unibi.citec.clf.bonsai.engine.scxml.config.TransitionError.TransitionErrorType.MISSING) {
                                isValid = false;
                            }
                        }
                        results.transitionNotFoundException.addAll(e);
                    }

                } catch (StateNotFoundException e) {
                    results.stateNotFoundException.add(e);
                }
            }
        }
        if (isValid) {
            logger.debug("Parsing and validation successful.");
        } else {
            logger.fatal("Parsing and validation not successful. SUCCESS:" + results.success());
        }

        return results;
    }

    /**
     * Checks if all send events are captured with Transitions
     *
     * @param aSCXML
     * @return
     */
    private Collection<? extends TransitionError> findMissingSendTransitions(SCXML aSCXML) {
        List<TransitionError> result = new ArrayList<>();

        Map<String, TransitionTarget> map = aSCXML.getTargets();

        Map<String, Set<String>> eventsMap = new ConcurrentHashMap<>();

        for (Map.Entry<String, TransitionTarget> entry : map.entrySet()) {
            String stateID = entry.getKey();
            TransitionTarget target = entry.getValue();


            OnEntry onentry = target.getOnEntry();
            if(onentry!=null) onentry.getActions().forEach(it ->{
                Action action = (Action) it;
                if(action instanceof Send) {
                    Send send = (Send) action;
                    String event = send.getEvent();
                    logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                    Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                    eventSet.add(event.replaceAll("'",""));
                    eventsMap.put(stateID, eventSet);
                }
            });

            OnExit onexit = target.getOnExit();
            if(onexit!=null) onexit.getActions().forEach(it ->{
                Action action = (Action) it;
                if(action instanceof Send) {
                    Send send = (Send) action;
                    String event = send.getEvent();
                    logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                    Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                    eventSet.add(event.replaceAll("'",""));
                    eventsMap.put(stateID, eventSet);
                }
            });

            target.getTransitionsList().forEach( t -> {
                Transition trans = (Transition) t;

                for(Object a : trans.getActions()) {
                    Action action = (Action) a;
                    if(action instanceof Send) {
                        Send send = (Send) action;
                        String event = send.getEvent();
                        logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                        Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                        eventSet.add(event.replaceAll("'",""));
                        eventsMap.put(stateID, eventSet);
                    }
                }

            });
        }


        for(Map.Entry<String, Set<String>> entry : eventsMap.entrySet()) {
            String stateID = entry.getKey();
            TransitionTarget target = map.get(stateID);
            Set<String> events = entry.getValue();
            Set<String> usedEvents = new HashSet<>();
            logger.trace("Checking Sends of state " + target.getId());
            while((target = target.getParent()) != null) {
                logger.trace("  - checking transitions of state " + target.getId());
                List<Transition> transitions = target.getTransitionsList();
                for(Transition trans : transitions) {
                    logger.trace("      - uses event " + trans.getEvent());
                    usedEvents.add(trans.getEvent());
                }
            }
            events.removeAll(usedEvents);
            if(!events.isEmpty()) {
                for(String event : events) {
                    TransitionError error = new TransitionError(stateID, event);
                    result.add(error);
                    logger.error(error.getMessage());
                }
            }
        }

        return result;
    }

    private List<TransitionError> checkCompositeStateTransitions(String id, Map<String,TransitionTarget> map) {
        List<TransitionError> result = new ArrayList<>();

        return result;
    }

    private boolean validateExistance(StateID state) throws StateNotFoundException {
        boolean isValid;
        try {
            Class.forName(state.getFullSkill());
            // No exception => class exists
            logger.debug("... class exists.");
            isValid = true;
        } catch (ClassNotFoundException e) {
            // Class does not exist
            logger.fatal("... class " + state.getFullSkill()
                    + " does not exist.");
            isValid = false;
            throw new StateNotFoundException(
                    "Can not instantiate skill with name: "
                            + state.getFullSkill(), e);
        } catch (VerifyError e) {
            logger.fatal("VerifyError while checking class "
                    + state.getFullSkill() + ": " + e.getMessage());
            logger.trace(e);
            isValid = false;
            throw new StateNotFoundException(
                    "Can not instantiate skill with name: "
                            + state.getFullSkill(), e);
        }
        return isValid;
    }

    private List<TransitionError> validateTransitions(StateID state, State currentState, Set<ExitToken> tokens) {

        List<TransitionError> errors = new ArrayList<>();

        boolean error = false;
        boolean errorPS = false;
        boolean success = false;
        boolean successPS = false;

        //FIXME special cases
        if (state.getCanonicalSkill().equals("End") || state.getCanonicalSkill().equals("Fatal") || state.getCanonicalSkill().equals("Error")) {
            return errors;
        }

        logger.trace("####Transition check: " + state.getCanonicalID() + "\"");
        tokens.add(ExitToken.fatal());
        // check if all tokens are handled
        for (ExitToken t : tokens) {

            ExitStatus statusForToken = t.getExitStatus();

            switch (statusForToken.getStatus()) {
                case ERROR:
                    if (statusForToken.hasProcessingStatus()) {
                        errorPS = true;
                    } else {
                        error = true;
                    }
                    break;
                case SUCCESS:
                    if (statusForToken.hasProcessingStatus()) {
                        successPS = true;
                    } else {
                        success = true;
                    }
                    break;
            }

            String eventForToken = state.getCanonicalSkill() + '.' + statusForToken.getFullStatus();
            logger.trace(" ###event: " + eventForToken + "\"");

            if (statusForToken.looping()) {
                logger.fatal("VerifyError while checking class "
                        + state.getCanonicalID() + ": Registered a Loop event ");
                errors.add(new TransitionError(state, statusForToken));
            }

            //String eventForToken = statusForToken.getFullStatus();
            @SuppressWarnings("rawtypes")
            List transitions = new LinkedList<>();

            TransitionTarget curTarget = (TransitionTarget) currentState;
            List tmp;
            do {
                logger.trace("  ##for:" + curTarget.getId() + " event:" + eventForToken);
                tmp = curTarget.getTransitionsList(eventForToken);
                if (tmp != null) {
                    transitions.addAll(tmp);
                    logger.trace("   found some");
                }

                String regex = eventForToken;
                while (regex.contains(".")) {
                    regex = regex.substring(0, regex.lastIndexOf('.'));
                    tmp = curTarget.getTransitionsList(regex + ".*");
                    logger.trace("   #for:" + regex + ".*");
                    if (tmp != null) {
                        transitions.addAll(tmp);
                        logger.trace("   found some");
                    }

                }
                curTarget = curTarget.getParent();

            } while (curTarget != null);

            if (transitions.isEmpty()) {

                logger.fatal("VerifyError while checking state "
                        + state.getFullSkill() + ": Transition missing for event \"" + eventForToken + "\"");
                errors.add(new TransitionError(state, statusForToken));

            } else {
                //logger.debug("found");
                //check if one of the
                boolean cond = true;
                for (Object o : transitions) {
                    Transition transition = (Transition) o;
                    if (transition.getCond() == null || transition.getCond().isEmpty()) {
                        cond = false;
                    }
                }
                if (cond) {
                    logger.fatal("VerifyError while checking state "
                            + state.getFullSkill() + ": Event has only conditional Transitions \""
                            + state.getCanonicalSkill() + '.' + statusForToken.getFullStatus() + "\""
                    );
                    errors.add(new TransitionError(state, statusForToken, true));
                }
            }

        }

        if (error && errorPS) {
            errors.add(new TransitionError(state, ExitStatus.Status.ERROR));
        }
        if (success && successPS) {
            errors.add(new TransitionError(state, ExitStatus.Status.SUCCESS));
        }

        return errors;

    }

    /**
     * Finds and returns a set of unreached states in the given SCXML.
     *
     * @param aSCXML The SCXML to analyze.
     * @return A set of unreached states.
     */
    public Set<StateID> unreachedStates(SCXML aSCXML) throws StateIDException {
        Set<StateID> allStates = getAllStates(aSCXML);
        Set<StateID> reachedStates = getReachedStates(aSCXML);

        Set<StateID> unreachedStates = new HashSet<>(allStates);
        unreachedStates.removeAll(reachedStates);

        logger.error("UNREACHED STATE IDs: " + unreachedStates);

        return unreachedStates;
    }

    /**
     * Retrieves a set of all states in the given SCXML.
     *
     * @param aSCXML The SCXML to analyze.
     * @return A set of all states.
     */
    private Set<StateID> getAllStates(SCXML aSCXML) throws StateIDException {
        Set<StateID> allStates = new HashSet<>();

        Map<String, TransitionTarget> map = aSCXML.getTargets();
        for (String id : map.keySet()) {
            if (map.get(id) instanceof State) {
                State currentState = (State) map.get(id);
                allStates.add(new StateID(prefix, id));
            }
        }
        return allStates;
    }

    /**
     * Retrieves a set of reached states in the given SCXML.
     *
     * @param aSCXML The SCXML to analyze.
     * @return A set of reached states.
     */
    private Set<StateID> getReachedStates(SCXML aSCXML) {
        Set<StateID> reachedStates = new HashSet<>();

        Map<String, TransitionTarget> map = aSCXML.getTargets();
        for (String id : map.keySet()) {
            TransitionTarget target = map.get(id);

            // Add post-states of transitions
            target.getTransitionsList().forEach(t -> {
                Transition transition = (Transition) t;
                String postStateId = transition.getNext();
                if (postStateId != null) {
                    try {
                        // System.out.println("DELME postStateId: " + postStateId);
                        reachedStates.add(new StateID(prefix, postStateId));
                    } catch (StateIDException e) {
                        throw new RuntimeException(e);
                    }
                }
            });

            // Add post-states of onEntry actions
            OnEntry onEntry = target.getOnEntry();
            if (onEntry != null) {
                onEntry.getActions().forEach(action -> {
                    if (action instanceof TransitionTarget) {
                        String postStateId = ((TransitionTarget) action).getId();
                        if (postStateId != null) {
                            try {
                                reachedStates.add(new StateID(prefix, postStateId));
                            } catch (StateIDException e) {
                                throw new RuntimeException(e);
                            }
                        }
                    }
                });
            }

            // Add post-states of onExit actions
            OnExit onExit = target.getOnExit();
            if (onExit != null) {
                onExit.getActions().forEach(action -> {
                    if (action instanceof TransitionTarget) {
                        String postStateId = ((TransitionTarget) action).getId();
                        if (postStateId != null) {
                            try {
                                reachedStates.add(new StateID(prefix, postStateId));
                            } catch (StateIDException e) {
                                throw new RuntimeException(e);
                            }
                        }
                    }
                });
            }
        }

        // System.out.println("Reached states: " + reachedStates);
        return reachedStates;
    }

}
