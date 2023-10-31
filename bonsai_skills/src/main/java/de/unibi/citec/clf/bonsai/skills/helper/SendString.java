package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;

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
    String actuator = "";
    String msg = "";
    Boolean writeslot = false;

    private StringActuator rsbSender = null;
    private Sensor<String> rsbSensor = null;
    private MemorySlot<String> replySlot;
    private MemorySlot<String> msgSlot;
    private Boolean writeSlot = true;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorTimeout;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        msg = configurator.requestOptionalValue(KEY_MESSAGE, msg);
        actuator = configurator.requestOptionalValue(KEY_ACTUATOR, actuator);
        sensor = configurator.requestOptionalValue(KEY_SENSOR, sensor);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        writeSlot = configurator.requestOptionalBool(KEY_WRITESLOT, writeslot);

        if (msg.isEmpty() && !actuator.isEmpty()) {
            msgSlot = configurator.getSlot("StringMessage", String.class);
        }


        if (!sensor.isEmpty()) {
            rsbSensor = configurator.getSensor(sensor, String.class);
            if (writeSlot) {
                replySlot = configurator.getSlot("StringReply", String.class);
            }
        }

        if (!actuator.isEmpty()) {
            rsbSender = configurator.getActuator(actuator, StringActuator.class);
        }

        if (timeout > 0) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
        }

    }

    @Override
    public boolean init() {
        if (msg.isEmpty() && rsbSender != null) {
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

        if(rsbSender != null) {
            logger.info("sending [" + msg + "] over " + rsbSender.getTarget());
            try {
                rsbSender.sendString(msg);
            } catch (IOException e) {
                logger.fatal(e);
                return false;
            }
        }

        if (rsbSensor != null) {
            logger.info("Waiting for message on: " + rsbSensor.getTarget() + ((timeout > 0)? "" : " for" + timeout + "ms"));
        }
        if (timeout > 0) {
            timeout += Time.currentTimeMillis();
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
