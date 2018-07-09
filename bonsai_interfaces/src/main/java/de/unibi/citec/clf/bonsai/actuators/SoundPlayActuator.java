package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * @author rfeldhans
 */
public interface SoundPlayActuator extends Actuator {

    public Future<Boolean> play(String name) throws IOException;
}
