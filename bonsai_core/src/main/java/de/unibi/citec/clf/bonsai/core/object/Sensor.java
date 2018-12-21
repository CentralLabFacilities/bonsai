package de.unibi.citec.clf.bonsai.core.object;


import de.unibi.citec.clf.bonsai.core.SensorListener;

import java.io.IOException;

/**
 * Interface for sensors that defines two ways of receiving data from a sensor.
 * One possibility is to use the synchronous interface with {@link #readLast()}.
 * If this is not desired, an asynchronous interface can be used based on the
 * observer pattern.
 *
 * @param <T> data type read by this sensor
 * @author lschilli
 * @author dklotz
 * @author jwienke
 */
public interface Sensor<T> extends ManagedCoreObject {

    /**
     * Returns a class object describing the data returned by this sensor.
     *
     * @return data type class
     */
    Class<T> getDataType();

    // synchronous api ---------------------------------------------------------

    /**
     * Reads the last (newest) data this sensor can provide and waits a maximum
     * time if there is no data available.
     *
     * @param timeout time to wait for new data in ms.
     * @return data or <code>null</code> if timeout was reached
     * @throws IOException          communication error with the data provider
     * @throws InterruptedException interrupted while waiting for new data
     */
    T readLast(long timeout) throws IOException, InterruptedException;

    /**
     * Tells if there are new data available that can be read via one of the
     * <code>readLast</code> methods.
     *
     * @return <code>true</code> if new data are available, else
     * <code>false</code>
     */
    boolean hasNext();

    /**
     * Clear any cached data.
     */
    void clear();

    // asynchronous api --------------------------------------------------------

    /**
     * Adds a new listener to this sensor that will be notified asynchronously
     * the moment new data is available.
     *
     * @param listener new listener to add to this sensor
     */
    void addSensorListener(SensorListener<T> listener);

    /**
     * Removes the specified listener from this sensor so that it will not be
     * notified for new data.
     *
     * @param listener listener to remove
     */
    void removeSensorListener(SensorListener<T> listener);

    /**
     * Removes all listeners from this sensor so that they will not be
     * notified for new data.
     */
    void removeAllSensorListeners();

}
