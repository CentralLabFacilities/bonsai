package de.unibi.citec.clf.bonsai.engine.scxml.config;

import de.unibi.citec.clf.bonsai.core.exception.StateIDException;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.scxml.SkillConfigFaults;

import java.util.HashSet;
import java.util.Set;

/**
 * @author lruegeme
 */
public class StateMachineConfiguratorResults {

    private Set<SkillConfigFaults> stateMachineConfigErrors = new HashSet<>();
    private Set<StateIDException> stateIDExceptions = new HashSet<>();
    private int errors = 0;
    private int warnings = 0;

    public void add(SkillConfigFaults e) {
        stateMachineConfigErrors.add(e);
        if (e.hasError()) {
            errors++;
        } else {
            warnings++;
        }
    }

    public void add(StateIDException e) {
        stateIDExceptions.add(e);
        errors++;
    }

    public void merge(StateMachineConfiguratorResults other) {
        stateMachineConfigErrors.addAll(other.stateMachineConfigErrors);
        stateIDExceptions.addAll(other.stateIDExceptions);
        errors += other.errors;
        warnings += other.warnings;
    }

    public int numErrors() {
        return errors;
    }

    public int numWarnings() {
        return warnings;
    }

    public boolean success(boolean warn) {
        return (warn) ? errors + warnings == 0 : errors == 0;
    }


    public String generateUnreachedWarning(Set<StateID> unreachedStates, boolean warnings) {
        StringBuilder output = new StringBuilder();
        boolean gen = false;
        boolean warn = false;
        for (SkillConfigFaults e : stateMachineConfigErrors) {
            if (!e.getNoSlotDefinitions().isEmpty()) {
                gen = true;
            }
            if (warnings && !e.getDefaultSlotWarnings().isEmpty()) {
                warn = true;
            }
        }
        if (gen || warn) {
            if (!unreachedStates.isEmpty()) {
                output.append("Unreached States:\n");
                for (StateID state : unreachedStates) {
                    output.append(state.getCanonicalSkill() + "\n");
                }
            }
        }
        return output.toString();
    }

    public String generateSlotHint(String prefixToRemove, boolean warnings) {
        StringBuilder output = new StringBuilder();
        boolean gen = false;
        boolean warn = false;
        for (SkillConfigFaults e : stateMachineConfigErrors) {
            if (!e.getNoSlotDefinitions().isEmpty()) {
                gen = true;
            }
            if (warnings && !e.getDefaultSlotWarnings().isEmpty()) {
                warn = true;
            }
        }
        if (gen || warn) {
            //Map<String, List<String>> missing = new HashMap<>();
            //new ArrayList<StateAndSlot>();
            for (SkillConfigFaults e : stateMachineConfigErrors) {
                String state = e.getState().getFullID().replace(prefixToRemove, "");
                for (String slot : e.getNoSlotDefinitions()) {
                    output.append("<slot key=\"" + slot + "\" state=\"" + state + "\" xpath=\"/null\"/> \n");
                }
            }
        }

        if (warn) {
            output.append("\tDefaults:\n\n");
            for (SkillConfigFaults e : stateMachineConfigErrors) {
                String state = e.getState().getFullID().replace(prefixToRemove, "");
                for (String slot : e.getDefaultSlotWarnings()) {
                    output.append("<slot key=\"" + slot + "\" state=\"" + state + "\" xpath=\"/" + slot + "\"/> \n");
                }
            }

        }
        return output.toString();
    }

    public String toString(boolean warn) {
        if (success(warn)) {
            return "Configuring state machine was successful";
        }
        String out = "";
        if (numErrors() > 0) {
            out += "";
        }
        for (SkillConfigFaults l : stateMachineConfigErrors) {
            out += "\n" + l.getErrorMessage();
        }
        for (StateIDException l : stateIDExceptions) {
            out += "\n" + l.getMessage();
        }
        /* TODOif (warnings > 0) {
        out += "\n<b>State machine configuration warnings:</b>\n";
        for (SkillConfigFaults l : stateMachineConfigErrors) {
        out += "\n" + l.getWarnings();
        }
        } */
        return out;
    }

}
