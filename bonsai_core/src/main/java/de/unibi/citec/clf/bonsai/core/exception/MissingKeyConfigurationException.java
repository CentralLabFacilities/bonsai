package de.unibi.citec.clf.bonsai.core.exception;

/**
 *
 * @author lruegeme
 */
public class MissingKeyConfigurationException extends ConfigurationException {

    private String key = "";
    private Class c = Object.class;
    
    public MissingKeyConfigurationException(String key, Class clazz) {
        super("missing parameter: '" + key + "' with type '" + clazz + "'");
        this.key = key;
        this.c = clazz;
    }
    
    public String getKey() {
        return key;
    }

    public Class getC() {
        return c;
    }
    
    
}
