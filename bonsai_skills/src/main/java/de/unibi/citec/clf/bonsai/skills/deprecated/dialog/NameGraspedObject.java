package de.unibi.citec.clf.bonsai.skills.deprecated.dialog;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.AnnotationHelper;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;

/**
 * This class is used to speak the ClassLabel for grasped object.
 *
 * @author lruegeme
 */
public class NameGraspedObject extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_MESSAGE = "#_MESSAGE";
    private static final String KEY_NONBLOCKING = "#_NONBLOCKING";

    private static final String REPLACE_STRING = "$OB";
    private static final String REPLACE_CAT_STRING = "$CAT";

    private boolean nonblocking = true;
    private SpeechActuator speechActuator;
    private MemorySlot<ObjectShapeData> graspObjSlot;
    //private TalkThread talkThread;

    private String message = "I will grasp the " + REPLACE_STRING;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);
        graspObjSlot = configurator.getSlot(
                "GraspObjectSlot", ObjectShapeData.class);

        message = configurator.requestOptionalValue(KEY_MESSAGE, message);
        nonblocking = configurator.requestOptionalBool(KEY_NONBLOCKING, nonblocking);

    }

    @Override
    public boolean init() {
        logger.debug("message template: " + message);

        ObjectShapeData obj = null;
        try {
            obj = graspObjSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn(ex.getMessage());
            return false;
        }

        if (obj == null) {
            logger.error("Error: No Object to speek about!...");
            return false;
        }

        String label = obj.getBestLabel();

        if (label.isEmpty()) {
            logger.error("Error: No hypo to speek about!...");
            return false;
        }

        String cat = "unknown";
        if (AnnotationHelper.objCategoryContains(label)) {
            cat = AnnotationHelper.getobjCategory(label);
        }

        message = message.replaceAll(REPLACE_STRING, label);
        message = message.replaceAll(REPLACE_CAT_STRING, cat);

        //talkThread = new TalkThread(speechActuator, message.replaceAll("_", " "), tokenSuccess);
        //talkThread.start();

        return true;

    }

    @Override
    public ExitToken execute() {
/*
        if (talkThread == null) {
            return ExitToken.fatal();
        }

        if (nonblocking) {
            return tokenSuccess;
        }

        if (talkThread.isAlive()) {
            // talking has been started but is not finished yet
            return ExitToken.loop();
        } else {
            // talking is finished
            return talkThread.getStatus();
        }*/
        return ExitToken.loop();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
