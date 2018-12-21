package de.unibi.citec.clf.bonsai.core.exception;

/**
 * @author lruegeme
 */
public class ParameterCastConfigurationException extends ConfigurationException {

    private final String key;
    private final String value;
    private final Class type;

    public ParameterCastConfigurationException(String key, Class clazz, String value) {
        super("could not read param:'" + key + "' with value: '" + value + "' as type:'" + clazz + "'");
        this.key = key;
        this.type = clazz;
        this.value = value;
    }

    public String getKey() {
        return key;
    }

    public Class getType() {
        return type;
    }

    public String getValue() {
        return value;
    }

}
