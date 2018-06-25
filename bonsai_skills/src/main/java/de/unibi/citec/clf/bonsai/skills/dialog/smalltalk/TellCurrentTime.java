package de.unibi.citec.clf.bonsai.skills.dialog.smalltalk;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.Calendar;
import java.util.concurrent.Future;

/**
 * Tell the current time.
 *
 * <pre>
 *
 * Options:
 *  #_BLOCKING: [boolean] Optional (default: false)
 *                  -> Should the skill block while the robot is talking
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    Robot said the current time
 *
 * Sensors:
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Called to let the robot speak
 *
 * </pre>
 *
 * @author rfeldhans
 * @author jkummert
 */
public class TellCurrentTime extends AbstractSkill {

    private static final String KEY_BLOCKING = "#_BLOCKING";
    private boolean blocking = false;

    private ExitToken tokenSuccess;

    private SpeechActuator speechActuator;

    private Future<Void> sayingComplete;

    @Override
    public void configure(ISkillConfigurator configurator) {
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
    }

    @Override
    public boolean init() {

        Calendar rightNow = Calendar.getInstance();
        int hour = rightNow.get(Calendar.HOUR_OF_DAY);
        int minutes = rightNow.get(Calendar.MINUTE);

        int random = (int) (Math.random() * 5);
        String sayingTime = "";
        switch (random) {
            case 1:
                sayingTime = "It is currently " + hour + " oclock " + "and " + minutes + " minutes";
                break;
            case 2:
                sayingTime = "The time is " + hour + " oclock " + "and " + minutes + " minutes";
                break;
            case 3:
                sayingTime = "Now it is " + hour + " oclock " + "and " + minutes + " minutes";
                break;
            default:
                if (minutes < 30) {
                    sayingTime = "It is " + minutes + " past " + hour;
                } else {
                    sayingTime = "It is " + (60 - minutes) + " minutes before " + (hour + 1) + " oclock";
                }
                break;
        }

        try {
            sayingComplete = speechActuator.sayAsync(sayingTime);
        } catch (IOException ex) {
            logger.error("Could not call speech actuator");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!sayingComplete.isDone() && blocking) {
            return ExitToken.loop();
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
