package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;
import java.io.IOException;
import java.util.Map;

/**
 * @author lruegeme
 */
public class SendString extends AbstractSkill {

    static final String KEY_MESSAGE = "#_MSG";
    static final String KEY_ACTUATOR = "#_ACTUATOR";
    static final String KEY_SENSOR = "#_SENSOR";
    static final String KEY_TIMEOUT = "#_TIMEOUT";
    static final String KEY_WRITESLOT = "#_WRITESLOT";

    //defaults
    long timeout = -1;
    String sensor = "";
    String actuator;
    String msg = "";
    Boolean writeslot = false;

    private StringActuator rsbSender;
    private Sensor<String> rsbSensor = null;
    private MemorySlot<String> replySlot;
    private MemorySlot<String> msgSlot;
    private Boolean writeSlot;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorTimeout;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        msg = configurator.requestOptionalValue(KEY_MESSAGE, msg);
        actuator = configurator.requestValue(KEY_ACTUATOR);
        sensor = configurator.requestOptionalValue(KEY_SENSOR, sensor);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        writeSlot = configurator.requestOptionalBool(KEY_WRITESLOT, writeslot);

        if (msg.isEmpty()) {
            msgSlot = configurator.getSlot("StringMessage", String.class);
        }

        rsbSender = configurator.getActuator(actuator, StringActuator.class);
        if (!sensor.isEmpty()) {
            rsbSensor = configurator.getSensor(sensor, String.class);
            if (writeSlot) {
                replySlot = configurator.getSlot("StringReply", String.class);
            }
        }

        if (timeout > 0) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
        }

    }

    @Override
    public boolean init() {
        if (msg.isEmpty()) {
            try {
                msg = msgSlot.recall();
            } catch (CommunicationException e) {
                logger.fatal(e);
                return false;
            }
            if (msg == null) {
                logger.error("message is null");
                return false;
            }
        }
        if (timeout > 0) {
            timeout += Time.currentTimeMillis();
        }

        logger.info("sending [" + msg + "] over " + rsbSender.getTarget());
        try {
            rsbSender.sendString(msg);
        } catch (IOException e) {
            logger.fatal(e);
            return false;
        }

        if (rsbSensor != null) {
            logger.info("Listen on: " + sensor);
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (rsbSensor == null) {
            return tokenSuccess;
        }

        if (timeout > 0 && timeout < Time.currentTimeMillis()) {
            return tokenErrorTimeout;
        }

        if (!rsbSensor.hasNext()) {
            rsbSensor.clear();
            return ExitToken.loop(100);
        }

        try {
            String reply = rsbSensor.readLast(200);
            logger.error("got reply: " + reply);
            if (writeSlot) {
                replySlot.memorize(reply);
            }
        } catch (IOException | InterruptedException | CommunicationException e) {
            logger.fatal(e);
            return ExitToken.fatal();
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
