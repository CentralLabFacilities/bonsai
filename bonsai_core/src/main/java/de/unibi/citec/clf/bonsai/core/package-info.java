/**
 * Provides the central classes used for configuring and accessing the BonSAI
 * system.
 *
 * <p>
 * All classes and interfaces provided here are middleware-independent.
 * </p>
 * 
 * <p>
 * {@link de.unibi.airobots.bonsai.core.BonsaiManager} is the central entry
 * point to the BonSAI system. It parses a user-specified configuration into a
 * set of valid {@link de.unibi.airobots.bonsai.core.Sensor}s and
 * {@link de.unibi.airobots.bonsai.core.Actuator}s and provides methods to
 * retrieve new instances of the Sensors or Actuators.
 * </p>
 * 
 * <p>
 * A {@link de.unibi.airobots.bonsai.core.Sensor} represents some kind of
 * information providing system of the robot more or less without manipulating
 * the environment. An {@link de.unibi.airobots.bonsai.core.Actuator} in
 * contrast is essentially manipulating the robot or the environment.
 * </p>
 * 
 * <p>
 * Sensors and Actuators are provided by implementations of
 * {@link de.unibi.airobots.bonsai.core.CoreObjectFactory}. These instances
 * provide middleware-specific implementations of the requested sensors or
 * actuators. A client program should only rely on the abstract middleware-
 * independent interfaces for Sensors or Actuators.
 * </p>
 * 
 * <p>
 * {@link de.unibi.airobots.bonsai.core.BonsaiManager} can be configured using
 * user-supplied configuration objects. The interfaces for these objects are
 * defined in {@link de.unibi.airobots.bonsai.core.configuration}.
 * </p>
 */

package de.unibi.citec.clf.bonsai.core;



