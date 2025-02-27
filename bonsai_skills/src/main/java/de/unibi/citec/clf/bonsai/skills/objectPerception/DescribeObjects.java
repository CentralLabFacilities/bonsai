package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectData.Hypothesis;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.data.speechrec.Language;

/**
 * Describe Objects.
 *
 *
 * @author lruegeme
 */
public class DescribeObjects extends AbstractSkill {

    private static final String UNKNOWN_LABEL = "unknown";

    private static final String KEY_MINREL = "#_MIN_REL";
    private static final String KEY_BY_POSITION = "#_BY_POSITION";

    //defaults 
    private double minRel = -1.0;

    private boolean byPosition = false;

    // used tokens
    private ExitToken tokenSuccess;

    private MemorySlotReader<ObjectShapeList> objectsRecognizedSlot;
    private SpeechActuator speechActuator;

    private ObjectShapeList foundObjects;
    private ObjectShapeList filtered;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        objectsRecognizedSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);

        byPosition = configurator.requestOptionalBool(KEY_BY_POSITION, byPosition);
        minRel = configurator.requestOptionalDouble(KEY_MINREL, minRel);

        if (byPosition) {
            throw new SkillConfigurationException("by position unsupported");
            //get slot
            //return;
        }
    }

    @Override
    public boolean init() {

        try {
            foundObjects = objectsRecognizedSlot.recall();

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (foundObjects == null) {
            logger.error("no objects recognized before");
            return false;
        }

        return true;

    }

    @Override
    public ExitToken execute() {
        logger.debug("entered method execute()");
        filterByLabel();
        say("there are " + filtered.size() + " objects");

        if (byPosition) {
            describePositions();
        } else {
            describeLabels();
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;

    }

    private void filterByLabel() {

        filtered = new ObjectShapeList();

        boolean calcRel = (minRel == -1.0);

        logger.debug("foundObjects");
        for (ObjectShapeData obj : foundObjects) {

            logger.debug(" -foundObject: " + obj.getBestLabel());
            if (calcRel) {
                minRel = 1.0 / obj.getHypotheses().size();
            }
            Hypothesis h = new Hypothesis();
            h.setReliability(obj.getBestRel());
            if (obj.getBestRel() > minRel) {
                //logger.debug("  using this");
                h.setClassLabel(obj.getBestLabel());
            } else {
                //logger.debug("  as unknown " + obj.getBestRel());
                h.setClassLabel(UNKNOWN_LABEL);
            }
            obj.clearHypotheses();
            obj.addHypothesis(h);
            filtered.add(obj);
        }

    }

    private void describePositions() {

    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     */
    private void say(String text) {
        try {
            speechActuator.sayAsync(text, Language.EN).get();
        } catch (Exception ex) {
            logger.debug("Exception in say()");
            // Not so bad. The robot just says nothing.
            logger.warn(ex.getMessage());

        }
    }

    private void describeLabels() {
        logger.debug("entered method describeLabels()");
        String labels = "";
        int uk = 0;

        for (ObjectShapeData o : filtered) {
            logger.debug("object is " + o.getBestLabel());
            if (o.getBestLabel().equals(UNKNOWN_LABEL)) {
                uk++;
            } else {
                labels = labels.replaceAll(" and", ",");
                if (!labels.isEmpty()) {
                    labels += " and ";
                }
                labels += o.getBestLabel();
            }
        }

        if (uk < filtered.size()) {
            say("i see " + labels);
        }
        if (uk > 0) {
            say("and " + uk + " objects that i dont know");
        }
    }
}
