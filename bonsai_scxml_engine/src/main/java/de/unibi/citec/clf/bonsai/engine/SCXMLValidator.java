package de.unibi.citec.clf.bonsai.engine;


import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.config.fault.TransitionFault;
import de.unibi.citec.clf.bonsai.engine.scxml.config.ValidationResult;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.StateNotFoundException;
import nu.xom.*;
import org.apache.commons.scxml2.model.*;
import org.apache.log4j.Logger;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

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
        return validateAll(aSCXML, emptyTokens, true, false, false, Set.of());
    }

    public ValidationResult validateTransitions(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens) throws StateIDException, StateNotFoundException {
        return validateAll(aSCXML, tokens, false, true, true, Set.of());
    }

    public ValidationResult validate(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens, Set<String> ignoredStates) throws StateIDException, StateNotFoundException {
        return validateAll(aSCXML, tokens, true, true, true, ignoredStates);
    }

    public static boolean hasDuplicates(InputSource is)
            throws ValidityException, ParsingException, IOException,
            SAXException, ParserConfigurationException {
        XMLReader reader = SAXParserFactory.newInstance().newSAXParser().getXMLReader();
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

    private ValidationResult validateAll(SCXML aSCXML, Map<StateID, Set<ExitToken>> tokens, boolean vExistence, boolean vTransition, boolean vSends, Set<String> ignoredStates) throws StateNotFoundException,
            StateIDException {

        Map<String, TransitionTarget> map = aSCXML.getTargets();

        ValidationResult results = new ValidationResult();

        if(vSends) results.transitionNotFoundException.addAll(findMissingSendTransitions(aSCXML));

        boolean isValid = results.transitionNotFoundException.isEmpty();

        for (String id : map.keySet()) {

            logger.debug("Found TransitionTarget: " + id);
            if(ignoredStates.contains(id)) {
                logger.debug("... ignoring.");
                continue;
            }

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
                    if (vExistence) {
                        isValid &= validateExistance(state);
                    }
                    if (vTransition) {
                        List<TransitionFault> e = validateTransitions(state, currentState, tokens.get(state));
                        for (TransitionFault t : e) {
                            if (t.type == TransitionFault.TransitionErrorType.MISSING) {
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
    private Collection<? extends TransitionFault> findMissingSendTransitions(SCXML aSCXML) {
        List<TransitionFault> result = new ArrayList<>();

        Map<String, TransitionTarget> map = aSCXML.getTargets();
        Map<String, Set<String>> eventsMap = new ConcurrentHashMap<>();

        for (Map.Entry<String, TransitionTarget> entry : map.entrySet()) {
            String stateID = entry.getKey();
            TransitionTarget ttarget = entry.getValue();
            if (ttarget instanceof EnterableState) {
                EnterableState target = (EnterableState) ttarget;
                target.getOnEntries().stream().map(it -> it.getActions()).flatMap(List::stream).collect(Collectors.toList()).forEach(it -> {
                    Action action = (Action) it;
                    if (action instanceof Send) {
                        Send send = (Send) action;
                        String event = send.getEvent();
                        logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                        Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                        eventSet.add(event.replaceAll("'", ""));
                        eventsMap.put(stateID, eventSet);
                    }
                });

                target.getOnExits().stream().map(it -> it.getActions()).flatMap(List::stream).collect(Collectors.toList()).forEach(it -> {
                    Action action = (Action) it;
                    if (action instanceof Send) {
                        Send send = (Send) action;
                        String event = send.getEvent();
                        logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                        Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                        eventSet.add(event.replaceAll("'", ""));
                        eventsMap.put(stateID, eventSet);
                    }
                });
            }

            if (ttarget instanceof TransitionalState) {
                TransitionalState target = (TransitionalState) ttarget;

                target.getTransitionsList().forEach(t -> {
                    for (Object a : t.getActions()) {
                        Action action = (Action) a;
                        if (action instanceof Send) {
                            Send send = (Send) action;
                            String event = send.getEvent();
                            logger.trace("Found send Action in State: " + stateID + " Event:" + event);
                            Set<String> eventSet = eventsMap.getOrDefault(stateID, new HashSet<>());
                            eventSet.add(event.replaceAll("'", ""));
                            eventsMap.put(stateID, eventSet);
                        }
                    }
                });
            }
        }

        for(Map.Entry<String, Set<String>> entry : eventsMap.entrySet()) {
            String stateID = entry.getKey();
            TransitionTarget ttarget = map.get(stateID);
            Set<String> events = entry.getValue();
            Set<String> usedEvents = new HashSet<>();
            logger.trace("Checking Sends of state " + ttarget.getId());
            while((ttarget = ttarget.getParent()) != null) {
                logger.trace("  - checking transitions of state " + ttarget.getId());
                if(ttarget instanceof TransitionalState){
                    TransitionalState target = (TransitionalState)ttarget;
                    List<Transition> transitions = target.getTransitionsList();
                    for(Transition trans : transitions) {
                        logger.trace("      - uses event " + trans.getEvent());
                        usedEvents.add(trans.getEvent());
                    }
                }
            }
            events.removeAll(usedEvents);
            if(!events.isEmpty()) {
                for(String event : events) {
                    TransitionFault error = new TransitionFault(stateID, event);
                    result.add(error);
                    logger.error(error.getMessage());
                }
            }
        }

        return result;
    }

    private List<TransitionFault> checkCompositeStateTransitions(String id, Map<String,TransitionTarget> map) {
        List<TransitionFault> result = new ArrayList<>();

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

    private List<TransitionFault> validateTransitions(StateID state, State currentState, Set<ExitToken> tokens) {

        List<TransitionFault> errors = new ArrayList<>();

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
                errors.add(new TransitionFault(state, statusForToken));
            }

            //String eventForToken = statusForToken.getFullStatus();
            List<Transition> transitions = new LinkedList<Transition>();
            if(currentState instanceof TransitionalState) {
                TransitionalState curTarget = (TransitionalState) currentState;
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
            }

            if (transitions.isEmpty()) {

                logger.fatal("VerifyError while checking state "
                        + state.getFullSkill() + ": Transition missing for event \"" + eventForToken + "\"");
                errors.add(new TransitionFault(state, statusForToken));

            } else {
                //logger.debug("found");
                //check if one of the
                boolean cond = true;
                for (Transition transition : transitions) {
                    if (transition.getCond() == null || transition.getCond().isEmpty()) {
                        cond = false;
                    }
                }
                if (cond) {
                    logger.fatal("VerifyError while checking state "
                            + state.getFullSkill() + ": Event has only conditional Transitions \""
                            + state.getCanonicalSkill() + '.' + statusForToken.getFullStatus() + "\""
                    );
                    errors.add(new TransitionFault(state, statusForToken, true));
                }
            }

        }

        if (error && errorPS) {
            errors.add(new TransitionFault(state, ExitStatus.Status.ERROR));
        }
        if (success && successPS) {
            errors.add(new TransitionFault(state, ExitStatus.Status.SUCCESS));
        }

        return errors;

    }
}
