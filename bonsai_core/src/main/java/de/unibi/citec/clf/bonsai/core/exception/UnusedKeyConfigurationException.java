package de.unibi.citec.clf.bonsai.core.exception;

/**
 *
 * @author lruegeme
 */
public class UnusedKeyConfigurationException extends ConfigurationException {

    private final String key;
    
    public UnusedKeyConfigurationException(String key) {
        super("unknown parameter: '" + key + "'");
        this.key = key;
    }
    
    public String getKey() {
        return key;
    }
    
    
}
