package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.speechrec.Language;
import de.unibi.citec.clf.btl.data.speechrec.NLU;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * @author rfeldhans
 */
public interface TranslationActuator extends Actuator {

    Future<NLU> translate(NLU sentence, Language to) throws IOException;

}
