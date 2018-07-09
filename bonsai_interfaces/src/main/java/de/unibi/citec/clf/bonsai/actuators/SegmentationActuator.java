package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * @author rfeldhans
 */
public interface SegmentationActuator extends Actuator {

    public Future<ObjectShapeList> segment(String label) throws IOException;
}
