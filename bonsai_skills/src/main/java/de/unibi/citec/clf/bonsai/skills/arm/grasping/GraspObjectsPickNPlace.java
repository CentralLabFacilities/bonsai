package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.GraspActuator;
import de.unibi.citec.clf.bonsai.actuators.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.arm.ArmController180;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Gasp an object from the list.
 *
 * @author lruegeme
 *
 *
 */
public class GraspObjectsPickNPlace extends AbstractSkill {

    private static final String KEY_TRY_ALL = "#_TRY_ALL";
    private static final String KEY_CHOOSE_GROUP = "#_CHOOSE_GROUP";

    //defaults 
    private boolean tryAll = false;
    private boolean overrideGroup = false;
    private String group = "left arm";

    private static final long LOOP_TIME = 333;

    // used tokens   
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorCantGrasp;

    private ArmController180 armController;
    private PicknPlaceActuator poseAct;

    private MemorySlot<ObjectShapeList> targetsSlot;
    private MemorySlot<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlot<ObjectShapeData> firstOrTarget;
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

        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);

        firstOrTarget = configurator.getSlot("GraspObjectSlot", ObjectShapeData.class);
        targetsSlot = configurator.getSlot("TargetObjectsSlot", ObjectShapeList.class);
        objectsRecognizedSlot = configurator.getSlot("ObjectShapeListSlot", ObjectShapeList.class);

        tryAll = configurator.requestOptionalBool(KEY_TRY_ALL, tryAll);
        overrideGroup = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, overrideGroup);
        
        if (overrideGroup){
            groupSlot = configurator.getSlot("GroupSlot", String.class);
            logger.info("using group slot!");
        }
        
    }

    @Override
    public boolean init() {
        armController = new ArmController180(poseAct);
        
        if (overrideGroup) {
            try {
                String gs = groupSlot.recall();
                if (gs.contains("right")) { //dirty
                    group = "right";
                } else {
                    logger.error("Using default planning group");
                    group = "left";
                }
            } catch (CommunicationException ex) {
                Logger.getLogger(GraspObjectsPickNPlace.class.getName()).log(Level.SEVERE, null, ex);
            } catch (NullPointerException ex) {
                logger.error("Using default planning group");
                group = "left_arm";
            }
        }
        
        logger.info("Using planning group: " + group + " arm");
        

        try {
            recognized = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn(ex.getMessage());
        } catch (Exception e){
            logger.error("frame id of object is missing!");
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
        } catch (Exception e){
            logger.error("frame id of object is missing!");
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
        } catch (Exception e){
            logger.error("frame id of object is missing!");
        }

        logger.info("trying " + curIdx + "of " + targets.size() + " \n\t" + curTarget.getId() + " is " + curTarget.getBestLabel() + "(" + curTarget.getBestRel() + ") at " + curTarget.getCenter());
        returnFuture = armController.graspObject(curTarget, group);

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

        logger.info("Armserver returned: " + GRT.toString());
        switch (GRT) {
            case SUCCESS:
                return tokenSuccess;
            //case ROBOT_CRASHED:
            //    return ExitToken.fatal();
            default:
                return getNext();

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

    private ExitToken getNext() {
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
        returnFuture = armController.graspObject(curTarget, group);
        return ExitToken.loop(50);

    }

}
