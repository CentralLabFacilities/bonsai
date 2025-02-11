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
     * Say method with the ability to chose between synchronous and asynchronous
     * speech synthesis.
     *
     * @param text
     * text to say
     * @return
     * @throws IOException
     * communication error
     */
    @Throws(IOException::class)
    fun sayAsync(text: String): Future<Void>?

    /**
     * Say method with the ability to choose the target language.
     * This should translate the Text to the target language before speaking.
     *
     * @param text english text to say
     * @param language target language to say
     * @throws IOException
     * communication error
     */
    @Throws(IOException::class)
    fun sayTranslated(text: String, language: Language = Language.EN): Future<String?>

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

    /**
     * Synchronous say method. Returns after the complete text was said.
     *
     * @param text
     * text to say
     * @throws IOException
     * communication error
     */
    @Deprecated("")
    @Throws(IOException::class)
    fun say(text: String)
}
