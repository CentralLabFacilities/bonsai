
package de.unibi.citec.clf.bonsai.engine.model.config;

import de.unibi.citec.clf.bonsai.core.configuration.*;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import java.util.HashSet;
import java.util.Set;

/**
 *
 * @author lruegeme
 */
public class SkillConfigurationResults {
    
    private Set<SkillConfigurationException> configurationExceptions = new HashSet<>();

    public SkillConfigurationResults() {
    }

    public Set<SkillConfigurationException> getConfigurationExceptions() {
        return configurationExceptions;
    }

    public void add(SkillConfigurationException e) {
        configurationExceptions.add(e);
    }

    public boolean success() {
        return configurationExceptions.isEmpty();
    }

    public void merge(SkillConfigurationResults other) {
        configurationExceptions.addAll(other.configurationExceptions);
    }

    @Override
    public String toString() {
        if (success()) {
            return "Configuring was successful";
        }
        String out = "";
        for (SkillConfigurationException l : configurationExceptions) {
            out += "\n" + l.getMessage();
        }
        return out;
    }
    
    
}
