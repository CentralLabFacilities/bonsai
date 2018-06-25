/**
 * Provides middleware-independent sensor interfaces. These interfaces are
 * specializations of the normal {@link de.unibi.airobots.bonsai.core.Sensor}.
 * 
 * <p>
 * In contrast to actuators which always need a task specific interface, most
 * sensors are completely defined by the return type they provide. This
 * interface is already completely defined by
 * {@link de.unibi.airobots.bonsai.core.Sensor}. If possible this should be
 * used. However, sometimes this is not sufficient, e.g. if providing the sensor
 * data requires some actions beforehand or providing the data is costly so that
 * it must be enabled or disabled. In these cases the general pattern is to
 * create a middleware-independent but more specific interface for the sensor in
 * this package. A client code should only rely on this interface and not the
 * concrete middleware-specific implementation.
 * </p>
 */
package de.unibi.citec.clf.bonsai.sensors;


