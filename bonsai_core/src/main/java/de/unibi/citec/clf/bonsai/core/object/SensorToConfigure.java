package de.unibi.citec.clf.bonsai.core.object;

import java.util.List;
import java.util.Map;

/**
 * Class encapsulating a sensor to configure.
 *
 * @author jwienke
 * @author lziegler
 */
public class SensorToConfigure {

    private String key;
    private Class<?> dataTypeClass;
    private Class<?> wireClass;
    private Class<? extends List<?>> listTypeClass;
    private Class<? extends Sensor<?>> sensorClass;
    private Map<String, String> sensorOptions;

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
     * Returns the produced data type of the configured sensor.
     *
     * @return data type class
     */
    public Class<?> getDataTypeClass() {
        return dataTypeClass;
    }

    /**
     * Sets the list type produced by the configured sensor.
     *
     * @param listTypeClass list type class that will be produced
     */
    public void setListTypeClass(Class<? extends List<?>> listTypeClass) {
        this.listTypeClass = listTypeClass;
    }

    /**
     * Returns the produced list type of the configured sensor.
     *
     * @return list type class
     */
    public Class<? extends List<?>> getListTypeClass() {
        return listTypeClass;
    }

    /**
     * Tells whether this sensor is expected to produce lists of data as
     * output.
     *
     * @return <code>true</code> is list is expected, otherwise
     * <code>false</code>.
     */
    public boolean isListSensor() {
        return listTypeClass != null;
    }

    /**
     * Sets the data type produced by the configured sensor.
     *
     * @param dataTypeClass data type class that will be produced
     */
    public void setDataTypeClass(Class<?> dataTypeClass) {
        this.dataTypeClass = dataTypeClass;
    }

    /**
     * Returns the implementing class of the sensor.
     *
     * @return implementing class of the sensor
     */
    public Class<? extends Sensor<?>> getSensorClass() {
        return sensorClass;
    }

    /**
     * Sets the implementing class of the sensor.
     *
     * @param sensorClass implenting class
     */
    public void setSensorClass(Class<? extends Sensor<?>> sensorClass) {
        this.sensorClass = sensorClass;
    }

    /**
     * Returns a key-value style map of user specified options for this
     * sensor configuration.
     *
     * @return options
     */
    public Map<String, String> getSensorOptions() {
        return sensorOptions;
    }

    /**
     * Sets the user specified map of options for this sensor configuration.
     *
     * @param sensorOptions options
     */
    public void setSensorOptions(Map<String, String> sensorOptions) {
        this.sensorOptions = sensorOptions;
    }

    public Class<?> getWireClass() {
        return wireClass;
    }

    public void setWireClass(Class<?> wireClass) {
        this.wireClass = wireClass;
    }


    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String s = "SensorToConfigure [key=" + key + ", sensorClass=" + sensorClass + ", dataTypeClass=" + dataTypeClass + ", wireClass=" + wireClass + ",  sensorOptions=" + sensorOptions;
        if (isListSensor()) {
            s += ", list = true, listTypeClass = " + listTypeClass;
        }
        s += "]";
        return s;
    }

}
