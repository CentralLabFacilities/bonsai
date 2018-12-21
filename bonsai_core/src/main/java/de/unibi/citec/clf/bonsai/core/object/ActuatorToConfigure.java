package de.unibi.citec.clf.bonsai.core.object;

import java.util.Map;

/**
 * Class encapsulating an actuator to configure.
 *
 * @author jwienke
 */
public class ActuatorToConfigure {

    private String key;
    private Class<? extends Actuator> actuatorClass;
    private Class<? extends Actuator> interfaceClass;
    private Map<String, String> actuatorOptions;

    /**
     * Unique key as specified by the user of the sensor.
     *
     * @return unique key
     */
    public String getKey() {
        return key;
    }

    /**
     * Sets the unique key specified by the user for this sensor.
     *
     * @param key new key
     */
    public void setKey(String key) {
        this.key = key;
    }

    /**
     * Returns the implementing class of the actuator.
     *
     * @return implementing class
     */
    public Class<? extends Actuator> getActuatorClass() {
        return actuatorClass;
    }

    /**
     * Sets the implementing class of the actuator.
     *
     * @param actuatorClass implementing class
     */
    public void setActuatorClass(Class<? extends Actuator> actuatorClass) {
        this.actuatorClass = actuatorClass;
    }

    /**
     * Returns the middleware-independent interface implemented by the
     * actuator.
     *
     * @return implemented interface
     */
    public Class<? extends Actuator> getInterfaceClass() {
        return interfaceClass;
    }

    /**
     * Sets the middleware-independent interface implemented by the
     * actuator.
     *
     * @param interfaceClass implemented interface
     */
    public void setInterfaceClass(Class<? extends Actuator> interfaceClass) {
        this.interfaceClass = interfaceClass;
    }

    /**
     * Returns a key-value style map of user specified options for this
     * actuator configuration.
     *
     * @return options
     */
    public Map<String, String> getActuatorOptions() {
        return actuatorOptions;
    }

    /**
     * Sets the user specified options for this actuator configuration.
     *
     * @param actuatorOptions options
     */
    public void setActuatorOptions(Map<String, String> actuatorOptions) {
        this.actuatorOptions = actuatorOptions;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "ActuatorToConfigure [actuatorClass=" + actuatorClass + ", actuatorOptions=" + actuatorOptions + ", interfaceClass=" + interfaceClass + ", key=" + key + "]";
    }

}
