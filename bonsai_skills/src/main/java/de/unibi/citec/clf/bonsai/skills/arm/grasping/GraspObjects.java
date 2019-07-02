package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.GraspActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Gasp an object from the list.
 *
 * @author lruegeme
 */
public class GraspObjects extends AbstractSkill {

    private static final String KEY_TRY_ALL = "#_TRY_ALL";
    private static final String KEY_CHOOSE_GROUP = "#_CHOOSE_GROUP";

    //defaults 
    private boolean tryAll = false;
    private boolean overrideGroup = false;
    private String group = null;

    private static final long LOOP_TIME = 333;

    // used tokens   
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorCantGrasp;

    private GraspActuator graspAct;

    private MemorySlotReader<ObjectShapeList> targetsSlot;
    private MemorySlotReader<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlotWriter<ObjectShapeData> firstOrTarget;
    private MemorySlot<String> groupSlot;

    private static final LengthUnit mm = LengthUnit.MILLIMETER;

    private int curIdx = 0;
    private ObjectShapeList targets = null;
    private ObjectShapeData curTarget;
    private ObjectShapeList recognized = null;
    private Future<GraspActuator.MoveitResult> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorCantGrasp = configurator.requestExitToken(ExitStatus.ERROR().ps("cantGrasp"));

        graspAct = configurator.getActuator("GraspActuator", GraspActuator.class);

        firstOrTarget = configurator.getWriteSlot("GraspObjectSlot", ObjectShapeData.class);
        targetsSlot = configurator.getReadSlot("TargetObjectsSlot", ObjectShapeList.class);
        objectsRecognizedSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);

        tryAll = configurator.requestOptionalBool(KEY_TRY_ALL, tryAll);
        overrideGroup = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, overrideGroup);

        if (overrideGroup) {
            groupSlot = configurator.getSlot("GroupSlot", String.class);
            logger.info("using group slot!");
        }

    }

    @Override
    public boolean init() {

        if (overrideGroup) {
            try {
                group = groupSlot.recall();
                logger.info("Using planning group: " + group);
            } catch (CommunicationException ex) {
                Logger.getLogger(GraspObjects.class.getName()).log(Level.SEVERE, null, ex);
            } catch (NullPointerException ex) {
                logger.error("Using default planning group: " + group);
            }
        }


        try {
            recognized = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn(ex.getMessage());
        }

        if (recognized == null) {
            logger.error("Could not read the ObjectList ");
            //return tokenError;
        }

        try {
            targets = targetsSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read objects for grasping" + ex.getMessage());
            return false;
        }

        if (targets == null || targets.isEmpty()) {
            logger.error("no targets");
            return false;
        }

        logger.info("have " + targets.size() + " wanted objects");

        curTarget = targets.get(curIdx);
        try {
            firstOrTarget.memorize(curTarget);
        } catch (CommunicationException ex) {
            logger.error(ex);
            return false;
        }

        logger.info("trying " + curIdx + "of " + targets.size() + " \n\t" + curTarget.getId() + " is " + curTarget.getBestLabel() + "(" + curTarget.getBestRel() + ") at " + curTarget.getCenter());
        try {
            returnFuture = graspAct.graspObject(curTarget, group);
        } catch (IOException e) {
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (!returnFuture.isDone()) {
            logger.debug("grasping is not done yet");
            return ExitToken.loop(LOOP_TIME);
        }

        GraspActuator.MoveitResult GRT;
        try {
            GRT = returnFuture.get();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal("could not get furure after isDone");
            return ExitToken.fatal();
        }

        logger.info("Grasping: " + GRT.toString());
        switch (GRT) {
            case SUCCESS:
                return tokenSuccess;
            default:
                try {
                    return getNext();
                } catch (IOException e) {
                    logger.error(e);
                    return ExitToken.fatal();
                }
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (!curToken.getExitStatus().isFatal()) {
            try {
                firstOrTarget.memorize(curTarget);
            } catch (CommunicationException ex) {
                logger.error(ex);
                return ExitToken.fatal();
            }
        }
        return curToken;
    }

    private ExitToken getNext() throws IOException {
        if (!tryAll) {
            logger.error("!tryall, tried only first in targets");
            return tokenErrorCantGrasp;
        }

        if (++curIdx >= targets.size()) {
            logger.error("no more objects in targets");
            return tokenErrorCantGrasp;
        }
        curTarget = targets.get(curIdx);
        logger.info("trying " + curIdx + "of " + targets.size() + " \n\t" + curTarget.getId() + " is " + curTarget.getBestLabel() + "(" + curTarget.getBestRel() + ") at " + curTarget.getCenter());
        returnFuture = graspAct.graspObject(curTarget, group);
        return ExitToken.loop(50);
    }

}
