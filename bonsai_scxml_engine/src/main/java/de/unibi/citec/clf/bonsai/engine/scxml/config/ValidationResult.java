package de.unibi.citec.clf.bonsai.engine.scxml.config;

import de.unibi.citec.clf.bonsai.engine.scxml.exception.StateNotFoundException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * @author lruegeme
 */
public class ValidationResult {

    public Set<StateNotFoundException> stateNotFoundException = new HashSet<>();
    public Set<TransitionError> transitionNotFoundException = new HashSet<>();

    public boolean success() {
        boolean valid = stateNotFoundException.isEmpty();
        for (TransitionError t : transitionNotFoundException) {
            if (t.type == TransitionError.TransitionErrorType.MISSING ||
                    t.type == TransitionError.TransitionErrorType.SEND) {
                valid = false;
                break;
            }
        }
        return valid;
    }

    public String getWarnings() {
        StringBuilder out = new StringBuilder();
        List<String> errors = new ArrayList<>();
        for (TransitionError l : transitionNotFoundException) {
            if (l.type == TransitionError.TransitionErrorType.MISSING ||
                    l.type == TransitionError.TransitionErrorType.SEND) {
                continue;
            }
            if (!errors.contains(l.getMessage())) {
                errors.add(l.getMessage());
            }
        }
        //only unique errors
        for (String e : errors) {
            out.append("\n").append(e);
        }
        return out.toString();
    }

    public String generateTransitionHints() {
        StringBuilder out = new StringBuilder();
        for (TransitionError l : transitionNotFoundException) {
            if (l.type == TransitionError.TransitionErrorType.MISSING) {
                out.append("<transition event=\"").append(l.id.getCanonicalSkill()).append(".").append(l.status.getFullStatus()).append("\" target=\"\"/> \n");
            } else if (l.type == TransitionError.TransitionErrorType.SEND) {
                out.append("<transition event=\"").append(l.event).append("\" target=\"\"/> \n");
            } else {
                //TODO
            }
        }
        return out.toString();
    }

    @Override
    public String toString() {
        if (success()) {
            return "Validation of state machine was successful";
        }
        String out = "";
        for (StateNotFoundException l : stateNotFoundException) {
            out += "\n" + l.getMessage();
        }
        for (TransitionError l : transitionNotFoundException) {
            if (l.type == TransitionError.TransitionErrorType.MISSING) {
                out += "\n" + l.getMessage();
            } else if(l.type == TransitionError.TransitionErrorType.SEND) {
                out += "\n " + l.getMessage();
            }
        }
        return out;
    }

    public void merge(ValidationResult otherResults) {
        stateNotFoundException.addAll(otherResults.stateNotFoundException);
        transitionNotFoundException.addAll(otherResults.transitionNotFoundException);
    }

}
