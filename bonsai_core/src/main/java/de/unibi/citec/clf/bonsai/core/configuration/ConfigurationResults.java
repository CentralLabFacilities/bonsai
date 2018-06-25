
package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 *
 * @author lruegeme
 */
public class ConfigurationResults {
    
    private Set<ConfigurationException> configurationExceptions = new HashSet<>();
    public Set<Exception> otherExceptions = Collections.newSetFromMap(new ConcurrentHashMap<Exception, Boolean>());

    public Set<ConfigurationException> getConfigurationExceptions() {
        return configurationExceptions;
    }

    public void add(ConfigurationException e) {
        configurationExceptions.add(e);
    }

    public void add(Exception e) {
        otherExceptions.add(e);
    }

    public boolean success() {
        return configurationExceptions.isEmpty() && otherExceptions.isEmpty();
    }

    public void merge(ConfigurationResults other) {
        configurationExceptions.addAll(other.configurationExceptions);
        otherExceptions.addAll(other.otherExceptions);
    }

    @Override
    public String toString() {
        if (success()) {
            return "Configuring was successful";
        }
        String out = "";
        for (ConfigurationException l : configurationExceptions) {
            out += "\n" + l.getMessage();
        }
        for (Exception l : otherExceptions) {
            out += "\n" + l.getMessage();
        }
        return out;
    }
    
}
