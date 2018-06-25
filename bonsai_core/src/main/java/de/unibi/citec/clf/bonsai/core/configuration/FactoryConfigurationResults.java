
package de.unibi.citec.clf.bonsai.core.configuration;

import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 *
 * @author lruegeme
 */
public class FactoryConfigurationResults {
    
    public Set<Exception> exceptions = Collections.newSetFromMap(new ConcurrentHashMap<Exception, Boolean>());

    public boolean success() {
        return exceptions.isEmpty();
    }

    public void merge(FactoryConfigurationResults r) {
        exceptions.addAll(r.exceptions);
    }

    @Override
    public String toString() {
        if (success()) {
            return "Configuring Factory was successful";
        }
        String out = "<b>Factory configuration errors:</b>\n";
        for (Exception l : exceptions) {
            out += "\n" + l.getMessage();
        }
        return out;
    }
    
}
