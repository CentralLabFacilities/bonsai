
package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.actuators.data.SetLanguageResult;
import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.concurrent.Future;

/**
 *
 * @author ffriese
 */
public interface LanguageActuator extends Actuator{


    /**
     * sets TTS Language
     * @param language Language to Set (e.g 'german', 'english', 'french', ...)
     * @return previous TTS language, in case you want to reset to it afterwards
     */
    Future<SetLanguageResult> setTTSLanguage(String language);
}
