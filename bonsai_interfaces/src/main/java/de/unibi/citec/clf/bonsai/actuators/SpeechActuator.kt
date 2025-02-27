package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.speechrec.Language
import java.io.IOException
import java.util.concurrent.Future
import javax.annotation.Nonnull

/**
 * Interface for actuators controlling a speech synthesizer.
 *
 * @author jwienke
 * @author arothert
 */
interface SpeechActuator : Actuator {
     /**
     * Multilingual say method with the ability to chose between synchronous and asynchronous
     * speech synthesis.
     *
     * @param text
     * text to say
     * @param language
     * language of the text
     * @return
     * @throws IOException
     * communication error
     */
    @Throws(IOException::class)
    fun sayAsync(text: String, textLanguage: Language = Language.EN): Future<Void>

    /**
     * Say method with the ability to choose the target language.
     * This should translate the english Text to the target language before speaking.
     *
     * @param text english text to say
     * @param speakLanguage target language to speak in
     * @param textLanguage language of the given text
     * @throws IOException
     * @return text that was spoken
     * communication error
     */
    @Throws(IOException::class)
    fun sayTranslated(text: String, speakLanguage: Language = Language.EN, textLanguage: Language = Language.EN): Future<String?>


    /**
     * Enable or disable ASR
     *
     * @param enable
     *
     * @return
     * @throws IOException
     * communication error
     */
    @Throws(IOException::class)
    fun enableASR(enable: Boolean): Future<Boolean>?

}
