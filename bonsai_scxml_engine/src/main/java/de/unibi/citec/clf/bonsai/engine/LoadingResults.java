package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.core.configuration.ConfigurationResults;
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

        StringBuilder out = new StringBuilder();

        if (!validationResult.success()) {
            out.append("#### State machine validation errors:");
            out.append(validationResult);
        }
        if (!stateMachineResults.success(showDefaultSlotWarnings)) {
            if(!out.isEmpty()) out.append("\n\n");
            out.append("#### State machine configuration errors:");
            out.append(stateMachineResults.toString(showDefaultSlotWarnings));
        }
        if (!configurationResults.success()) {
            if(!out.isEmpty()) out.append("\n\n");
            out.append("#### Configuration errors:");
            out.append(configurationResults);
        }
        if (!loadingExceptions.isEmpty()) {
            if(!out.isEmpty()) out.append("\n\n");
            out.append("#### General Errors:\n");
            for (LoadingException l : loadingExceptions) {
                out.append("\n" + l.getMessage());
            }
        }

        return out.toString();
    }
}
