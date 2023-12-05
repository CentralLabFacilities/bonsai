package de.unibi.citec.clf.bonsai.actuators.deprecated;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;

import java.util.List;
import java.util.concurrent.Future;

/**
 * Interface for Bimanual Grasping
 * 
 * @author ffriese
 */
@Deprecated
public interface BimanualGraspActuator extends Actuator {

    Future<List<String>> planBimanualGrasp(String object_uuid);
    Future<Boolean> visualizeBimanualGrasp(String solution_uuid);
    Future<Boolean> executeBimanualGrasp(String solution_uuid);
    ObjectShapeData spawnCollisonObject();
    void removeCollisionObject(String id);

}
