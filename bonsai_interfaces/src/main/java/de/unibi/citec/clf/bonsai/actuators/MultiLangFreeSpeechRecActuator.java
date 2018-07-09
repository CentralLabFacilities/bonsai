package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.speechrec.MultiLangFreeSpeech;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * @author rfeldhans
 */
public interface MultiLangFreeSpeechRecActuator extends Actuator {

    Future<MultiLangFreeSpeech> listen() throws IOException;
}
