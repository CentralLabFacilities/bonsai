package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.Type.NoSourceDocumentException;
import de.unibi.citec.clf.btl.data.speechrec.*;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.util.*;

/**
 * Simple helper class for working with speech recognition.
 *
 * @author lruegeme
 */
public class SimpleNLUHelper implements SensorListener<NLU> {


    /**
     * Default timeout when reading sensor.
     */
    private static final long DEFAULT_TIMEOUT = 3000;
    /**
     * The logger.
     */
    public static Logger logger = Logger.getLogger(SimpleNLUHelper.class);
    /**
     * Speech sensor that is used by this instance;
     */
    protected Sensor<NLU> speechSensor;
    protected LinkedList<NLU> utteranceBuffer = new LinkedList<>();
    private final Object utteranceBufferLock = new Object();
    private boolean hasNewUnderstandings = false;

    /**
     * Construct a new {@link SimpleNLUHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @deprecated use {@link #SimpleNLUHelper(Sensor, boolean)} instead.
     */
    @Deprecated
    public SimpleNLUHelper(Sensor<NLU> speechSensor) {
        this.speechSensor = speechSensor;
    }

    /**
     * Construct a new {@link SimpleNLUHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @param clearSensor clear sensor on construction
     */
    public SimpleNLUHelper(Sensor<NLU> speechSensor, boolean clearSensor) {
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
                NLU newData;
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
                    logger.debug("add to buffer: " + newData.getText()
                            + "\n" + newData.getSourceDocument());
                } catch (IOException e) {
                    logger.error("IO Error: " + e.getMessage());
                    logger.debug(e);
                    break;
                } catch (InterruptedException e) {
                    logger.error("Interrupted: " + e.getMessage());
                    logger.debug(e);
                    break;
                } catch (NoSourceDocumentException e) {
                    logger.warn("No source document");
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
     * @see SimpleNLUHelper#DEFAULT_TIMEOUT
     *
     * @return True on success, false otherwise.
     */
    @Deprecated
    public boolean waitForUnderstanding() throws IOException {
        return waitForUnderstanding(DEFAULT_TIMEOUT);
    }

    /**
     * Returns a list with all understood words.
     *
     * @return A list with all understood words.
     */
    public List<String> getAllUnderstoodIntents() {
        return utteranceBuffer.stream().map(it ->{
            return it.getIntent();
        }).toList();
    }


    public List<NLU> getAllNLUs(){
        synchronized (utteranceBufferLock) {
            //utteranceBuffer.clear();
            hasNewUnderstandings = false;
            return utteranceBuffer;
        }
    }

    public void clearBuffer() {
        utteranceBuffer.clear();
    }

    @Override
    public void newDataAvailable(NLU utter) {
        synchronized (utteranceBufferLock) {
            logger.debug("got new data: " + utter.getText());
            hasNewUnderstandings = true;
            utteranceBuffer.add(utter);
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
