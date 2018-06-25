package de.unibi.citec.clf.bonsai.core;



/**
 * Observer interface for the asynchronous interface of {@link Sensor}s.
 * 
 * @author jwienke
 * 
 * @param <T>
 *            data type received by the sensor to register on
 */
public interface SensorListener<T> {

    /**
     * Called with the newest data available for the sensor registered on.
     * 
     * @param newData
     *            new data to process
     */
    void newDataAvailable(T newData);

}
