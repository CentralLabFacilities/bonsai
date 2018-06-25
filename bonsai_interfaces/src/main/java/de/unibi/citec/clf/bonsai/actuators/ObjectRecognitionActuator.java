package de.unibi.citec.clf.bonsai.actuators;



import java.io.IOException;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.concurrent.Future;

/**
 * Interface for object recognition
 * 
 * @author lruegeme
 */
public interface ObjectRecognitionActuator extends Actuator {


    Future<Boolean> recognize() throws IOException;



}
