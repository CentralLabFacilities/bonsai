package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.data.speechrec.GrammarSymbol;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

import org.apache.log4j.Logger;

/**
 * Simple helper class for working with speech recognition.
 *
 * @author rfeldhans
 */
public class PepperSimpleSpeechHelper implements SensorListener<String> {

    /**
     * Implement this interface if you want to scan the grammar tree and
     * match/compare its symbols with whatever you want.
     */
    public interface MatchGrammarSymbol {

        /**
         * Match the given {@link GrammarSymbol} with whatever you want. Return
         * true if it is accepted, false otherwise.
         *
         * @param s Any symbol from the current grammar tree.
         * @return True if this symbol is accepted, false otherwise.
         */
        boolean match(GrammarSymbol s);
    }
    /**
     * Default timeout when reading sensor.
     */
    private static final long DEFAULT_TIMEOUT = 3000;
    /**
     * The logger.
     */
    public static Logger logger = Logger.getLogger(SimpleSpeechHelper.class);
    /**
     * Speech sensor that is used by this instance;
     */
    protected Sensor<String> speechSensor;
    protected LinkedList<String> utteranceBuffer = new LinkedList<>();
    private final Object utteranceBufferLock = new Object();
    private boolean hasNewUnderstandings = false;

    /**
     * Construct a new {@link SimpleSpeechHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @deprecated use {@link #SimpleSpeechHelper(Sensor, boolean)} instead.
     */
    @Deprecated
    public PepperSimpleSpeechHelper(Sensor<String> speechSensor) {
        this.speechSensor = speechSensor;
    }

    /**
     * Construct a new {@link SimpleSpeechHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @param clearSensor clear sensor on construction
     */
    public PepperSimpleSpeechHelper(Sensor<String> speechSensor, boolean clearSensor) {
        this.speechSensor = speechSensor;
        if (speechSensor != null) {
            speechSensor.addSensorListener(this);

            if (clearSensor) {
                speechSensor.clear();
            }
        }
    }

    /**
     * Wait until the system understood something.
     *
     * @param timeout Timeout in milliseconds.
     * @return True on success, false otherwise.
     */
    @Deprecated
    public boolean waitForUnderstanding(long timeout) {

        synchronized (utteranceBufferLock) {
            logger.debug("clear buffer");
            utteranceBuffer.clear();
        }
        speechSensor.clear();

        long startTime = Time.currentTimeMillis();

        while (Time.currentTimeMillis() - startTime < timeout) {

            boolean newDataAvailable = false;
            while (speechSensor.hasNext()) {
                String newData;
                ////////

                //////
                try {
                    newData = speechSensor.readLast(100);
                    if (newData == null) {
                        continue;
                    }

                    synchronized (utteranceBufferLock) {
                        utteranceBuffer.add(newData);
                        newDataAvailable = true;
                    }
                    logger.debug("add to buffer: " + newData);
                } catch (IOException e) {
                    logger.error("IO Error: " + e.getMessage());
                    logger.debug(e);
                    break;
                } catch (InterruptedException e) {
                    logger.error("Interrupted: " + e.getMessage());
                    logger.debug(e);
                    break;
                }
            }

            if (newDataAvailable) {
                logger.debug("buffer has data. size: " + utteranceBuffer.size());
                return true;
            }

            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                logger.warn("Interrupted");
            }
        }
        return false;

    }

    /**
     * Wait until the system understood something. Uses a default timeout.
     *
     * @see SimpleSpeechHelper#DEFAULT_TIMEOUT
     *
     * @return True on success, false otherwise.
     */
    @Deprecated
    public boolean waitForUnderstanding() throws IOException {
        return waitForUnderstanding(DEFAULT_TIMEOUT);
    }

    @Override
    public void newDataAvailable(String utter) {//TODO
        synchronized (utteranceBufferLock) {
            logger.fatal("got new data: " + utter);
            utteranceBuffer.add(utter);
            hasNewUnderstandings = true;
        }
    }

    public void startListening() {
        logger.debug("start listening");
        synchronized (utteranceBufferLock) {
            speechSensor.clear();
            utteranceBuffer.clear();
            hasNewUnderstandings = false;
        }

    }

    public List<String> getUnderstoodWords(List<String> toUnderstand) {
        ArrayList<String> l = new ArrayList();
        synchronized (utteranceBufferLock) {
            for (String understood : utteranceBuffer) {
                for (String maybeUnderstood : toUnderstand) {
                    if (understood.equals(maybeUnderstood)) {
                        l.add(understood);
                    }
                }
            }
        }
        logger.debug("pssh understoodWords: " + l);
        return l;
    }

    public boolean hasNewUnderstanding() {
        return hasNewUnderstandings;
    }

    public void removeHelper() {
        speechSensor.removeSensorListener(this);
    }

    @Override
    protected void finalize() throws Throwable {
        speechSensor.removeSensorListener(this);
        super.finalize();
    }
}
