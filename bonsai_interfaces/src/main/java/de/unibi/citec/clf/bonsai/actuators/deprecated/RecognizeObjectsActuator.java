
package de.unibi.citec.clf.bonsai.actuators.deprecated;




import de.unibi.citec.clf.bonsai.core.object.Actuator;

import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatchList;
import java.util.concurrent.ExecutionException;

/**
 *
 * @author jkummert
 */
@Deprecated public interface RecognizeObjectsActuator extends Actuator{

    @Deprecated List<ObjectShapeData> recognize() throws InterruptedException, ExecutionException;
    @Deprecated PlanePatchList getLastDetectedPlanes();
}
