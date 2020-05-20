package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Grasp an object from the list.
 * <pre>
 *
 * Options:
 *  #_TRY_ALL:      [boolean] Optional (Default: false)
 *                      -> Specify whether the robot should only try to grasp the first object of the targets or try all of them
 *  #_CHOOSE_GROUP: [boolean] Optional (Default: false)
 *                      -> If true, read the name of the planning group to use from GroupSlot, else use the default group
 *
 * Slots:
 *  ObjectShapeListSlot: [ObjectShapeList] [Read]
 *      -> A list of previously detected objects
 *  TargetObjectsSlot: [ObjectShapeList] [Read]
 *      -> A list of objects the robots should try to grasp
 *  GraspObjectSlot: [ObjectShapeData] [Write]
 *      -> The object that the robot tried to grasp last (whether that was successful or not)
 *  GroupSlot: [String] [Read]
 *      -> The name of the planning group to use. Only read if CHOOSE_GROUP is true
 *
 * ExitTokens:
 *  success:            Successfully grasped objects
 *  error.cantGrasp:    Cannot grasp
 *
 * Sensors:
 *
 * Actuators:
 *  GraspActuator: [GraspActuator]
 *      -> Called to grasp the objects
 *
 * </pre>
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

    private ManipulationActuator graspAct;

    private MemorySlotReader<ObjectShapeList> targetsSlot;
    private MemorySlotReader<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlotWriter<ObjectShapeData> firstOrTarget;
    private MemorySlotReader<String> groupSlot;

    private int curIdx = 0;
    private ObjectShapeList targets = null;
    private ObjectShapeData curTarget;
    private ObjectShapeList recognized = null;
    private Future<ManipulationActuator.MoveitResult> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorCantGrasp = configurator.requestExitToken(ExitStatus.ERROR().ps("cantGrasp"));

        graspAct = configurator.getActuator("GraspActuator", ManipulationActuator.class);

        firstOrTarget = configurator.getWriteSlot("GraspObjectSlot", ObjectShapeData.class);
        targetsSlot = configurator.getReadSlot("TargetObjectsSlot", ObjectShapeList.class);
        objectsRecognizedSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);

        tryAll = configurator.requestOptionalBool(KEY_TRY_ALL, tryAll);
        overrideGroup = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, overrideGroup);

        if (overrideGroup) {
            groupSlot = configurator.getReadSlot("GroupSlot", String.class);
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
            logger.error("Could not read the ObjectList");
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

        logger.info("trying " + curIdx + " of " + targets.size() + " \n\t" + curTarget.getId() + " is " +
                curTarget.getBestLabel() + "(" + curTarget.getBestRel() + ") at " + curTarget.getCenter());
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
            //logger.debug("grasping is not done yet");
            return ExitToken.loop(LOOP_TIME);
        }

        ManipulationActuator.MoveitResult GRT;
        try {
            GRT = returnFuture.get();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal("could not get future after isDone");
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
        logger.info("trying " + curIdx + " of " + targets.size() + " \n\t" + curTarget.getId() + " is " + curTarget.getBestLabel() + "(" + curTarget.getBestRel() + ") at " + curTarget.getCenter());
        returnFuture = graspAct.graspObject(curTarget, group);
        return ExitToken.loop(50);
    }

}
