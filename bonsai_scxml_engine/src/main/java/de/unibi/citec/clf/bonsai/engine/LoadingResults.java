package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import de.unibi.citec.clf.bonsai.engine.scxml.config.StateMachineConfiguratorResults;
import de.unibi.citec.clf.bonsai.engine.scxml.config.ValidationResult;
import de.unibi.citec.clf.bonsai.engine.scxml.exception.LoadingException;

import java.util.HashSet;
import java.util.Set;

public class LoadingResults {

    public ConfigurationResults configurationResults = new ConfigurationResults();
    public StateMachineConfiguratorResults stateMachineResults = new StateMachineConfiguratorResults();
    public ValidationResult validationResult = new ValidationResult();
    public Set<LoadingException> loadingExceptions = new HashSet<>();
    public String statePrefix = "";
    public boolean showDefaultSlotWarnings = true;

    public boolean success() {
        return configurationResults.success()
                && stateMachineResults.success(showDefaultSlotWarnings)
                && loadingExceptions.isEmpty()
                && validationResult.success();
    }

    @Override
    public String toString() {
        if (success()) {
            return "";
        }

        String out = "";

        if (!validationResult.success()) {
            out += "#### State machine validation errors:";
            out += validationResult + "\n\n";
        }
        if (!stateMachineResults.success(showDefaultSlotWarnings)) {
            out += "#### State machine configuration errors:";
            out += stateMachineResults.toString(showDefaultSlotWarnings) + "\n\n";
        }
        if (!configurationResults.success()) {
            out += "#### Configuration errors:";
            out += configurationResults + "\n\n";
        }
        if (!loadingExceptions.isEmpty()) {
            out += "#### General Errors:\n";
            for (LoadingException l : loadingExceptions) {
                out += "\n" + l.getMessage();
            }
        }
        if (!validationResult.unreachedStates.isEmpty()) {
            out += "#### Unreached States Warnings:\n";
            for (StateID state : validationResult.unreachedStates) {
                out += state.toString() + "\n";
                // System.out.println(state.getFullSkill());
            }
        }

        return out;
    }
}
