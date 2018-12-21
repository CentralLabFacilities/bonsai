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
import java.io.IOException;
import java.util.HashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * This skill listen to RSB and write input on a Slot.
 *
 * @author lruegeme, nneumann
 */
public class WaitForRSB extends AbstractSkill {

    private static final String KEY_SENSOR = "#_SENSOR";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_ACTUATOR = "#_ACTUATOR";
    private static final String KEY_WRITESLOT = "#_WRITESLOT";
    private static final String KEY_WAITSTRING = "#_WAITSTRING";
    private static final String KEY_CLEAR = "#_CLEAR"; //clear queue after reading data
    private static final String DEFAULT_KEY = "#_NONTERMINALS";
    private static final String KEY_WRITEVALUESLOT = "#_WRITEVALUESLOT";

    //defaults
    String sensor;
    String sender = "";
    String cmd = "";
    long timeout = -1;
    Boolean writeslot = false;
    Boolean writevalueslot = false;
    String in = "";
    String waitstring = "";
    
    String value = "";

    String replyMsg = "";

    Boolean clearAfterRead = false;
    Boolean nonterminaltrigger = false;

    private StringActuator stringSender;
    private Sensor<String> stringSensor;
    private MemorySlot<String> slot;
    private MemorySlot<String> valueslot;

    private Boolean writeSlot;
    private Boolean writeValueSlot;

    private String[] nonterminals = {};
    private String nonterminal = null;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorTimeout;

    private HashMap<String, ExitToken> tokenMap = new HashMap<>();

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        sender = configurator.requestOptionalValue(KEY_ACTUATOR, sender);
        sensor = configurator.requestValue(KEY_SENSOR);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        writeSlot = configurator.requestOptionalBool(KEY_WRITESLOT, writeslot);
        writeValueSlot = configurator.requestOptionalBool(KEY_WRITEVALUESLOT, writevalueslot);
        waitstring = configurator.requestOptionalValue(KEY_WAITSTRING, waitstring);
        clearAfterRead = configurator.requestOptionalBool(KEY_CLEAR, clearAfterRead);
        nonterminals = configurator.requestOptionalValue(DEFAULT_KEY, null).split(";");

        if (writeSlot) {
            slot = configurator.getSlot("String", String.class);
        }

        if (writeValueSlot) {
            logger.error("add slot for value");
            valueslot = configurator.getSlot("ValueString", String.class);
        }

        stringSensor = configurator.getSensor(sensor, String.class);

        if (!sender.isEmpty()) {
            stringSender = configurator.getActuator(sender, StringActuator.class);
        }

        if (timeout > 0) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
        }
        
        if(nonterminal != null) {
            for (String nt : nonterminals) {
                nonterminaltrigger = true;
                logger.error(nt);
                tokenMap.put(nt, configurator.requestExitToken(ExitStatus.SUCCESS().ps(nt)));
            }
        } else {
            nonterminal = "";
        }
    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            timeout += Time.currentTimeMillis();
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0 && timeout < Time.currentTimeMillis()) {
            return tokenErrorTimeout;
        }

        if (!stringSensor.hasNext()) {
            return ExitToken.loop(80);
        }

        try {
            in = stringSensor.readLast(100);
            logger.error("got msg [" + in + "]");
            if (!in.equals(waitstring) && !"".equals(waitstring)) {
                logger.error("got: " + in + " but wait for: " + waitstring);
                return ExitToken.loop(80);
            }
            if (writeSlot) {
                logger.error("no1");
                slot.memorize(in);
            }
            if (clearAfterRead) {
                stringSensor.clear();
                logger.error("stringsensor cleared");
            }
        } catch (IOException | InterruptedException | CommunicationException ex) {
            logger.fatal(ex);
            return ExitToken.fatal();
        }

        if (stringSender != null) {
            replyMsg = in + "rec";
            logger.error("sending reply [" + replyMsg + "]");
            try {
                stringSender.sendString(replyMsg);
            } catch (IOException e) {
                logger.fatal(e);

            }
        }

        if (nonterminaltrigger) {
            logger.error("nonterminal");
            for (String nonterm : nonterminals) {
                logger.error(nonterm);
                if (in.contains(nonterm)) {
                    if (in.contains("=")) {
                        value = in.split("=")[1];
                        cmd = in.split("=")[0];
                    } else {
                        cmd = nonterm;
                    }
                    logger.error("testhere");
                    logger.error(cmd);
                    if (nonterm.equals(cmd)) {
                        logger.error("equal");
                        if (writeValueSlot && in.contains("=")) {
                            logger.error("writeslot");

                            try {
                                valueslot.memorize(value);
                                logger.error(value);

                            } catch (CommunicationException ex) {
                                Logger.getLogger(WaitForRSB.class.getName()).log(Level.SEVERE, null, ex);
                            }
                        }
                        return tokenMap.get(nonterm);
                    }
                }
            }
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
