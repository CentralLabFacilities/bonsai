package de.unibi.citec.clf.bonsai.actuators;



import java.io.IOException;
import java.util.concurrent.Future;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import javax.annotation.Nonnull;

/**
 * Interface for actuators controlling a speech synthesizer.
 * 
 * @author jwienke
 * @author arothert
 */
public interface SpeechActuator extends Actuator {
    
    /**
     * Say method with the ability to chose between synchronous and asynchronous
     * speech synthesis.
     * 
     * @param text
     *            text to say
     * @return 
     * @throws IOException
     *             communication error
     */
    Future<Void> sayAsync(@Nonnull String text) throws IOException;

    /**
     * Enable or disable ASR
     *
     * @param enable
     *
     * @return
     * @throws IOException
     *              communication error
     */
    Future<Boolean> enableASR(@Nonnull Boolean enable) throws IOException;

    /**
     * Synchronous say method. Returns after the complete text was said.
     * 
     * @param text
     *            text to say
     * @throws IOException
     *             communication error
     */
    @Deprecated
    void say(@Nonnull String text) throws IOException;

    /**
     * For self-written prosody for the whole text.
     * 
     * @param accented_text
     * @throws IOException
     */
    void sayAccentuated(String accented_text) throws IOException;

    /**
     * For normal text, maybe accentuations within the text. Additionally a
     * configuration file path to set the overall prosody of a text must be
     * given.
     * 
     * @param accented_text
     * @param prosodyConfig
     * @throws IOException
     */
    void sayAccentuated(String accented_text, String prosodyConfig) throws IOException;

    /**
     * For self-written prosody for the whole text.
     * 
     * @param accented_text
     *            text to say, might invole specific accentuations of parts of
     *            the text (MARYXML - prosody - style).
     * @param async
     *            if <code>true</code>, wait until the complete text was said,
     *            else return as fast as possible from this method call
     * @throws IOException
     */
    void sayAccentuated(String accented_text, boolean async) throws IOException;

    /**
     * For normal text, maybe accentuations within the text. Additionally a
     * configuration file path to set the overall prosody of a text must be
     * given.
     * 
     * @param accented_text
     *            text to say, might invole specific accentuations of parts of
     *            the text (MARYXML - prosody - style).
     * @param async
     *            if <code>true</code>, wait until the complete text was said,
     *            else return as fast as possible from this method call
     * @param prosodyConfig
     *            path and file for overall prosody setting of the accented_text
     * @throws IOException
     */
    void sayAccentuated(String accented_text, boolean async, String prosodyConfig) throws IOException;
}
