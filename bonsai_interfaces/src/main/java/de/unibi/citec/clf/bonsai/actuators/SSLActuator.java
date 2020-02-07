
package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.actuators.data.SoundSourceLocalizationResult;
import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.common.Timestamp;

import java.util.concurrent.Future;

/**
 *
 * @author ffriese
 */
public interface SSLActuator extends Actuator{

    Future<SoundSourceLocalizationResult> getAverageAngle(Timestamp begin, Timestamp end);
}
