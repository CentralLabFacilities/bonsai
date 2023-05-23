package de.unibi.citec.clf.bonsai.skills.deprecated.arm;

import de.unibi.citec.clf.bonsai.actuators.deprecated.PicknPlaceActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.grasp.GraspReturnType;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * TODO: untobify
 * 
 * @author lruegeme
 */
public class PlaceObjectOnObject extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenNoResult;
    private ExitToken tokenError;
    private static final String KEY_TRY_ALL = "#_TRY_ALL";

    //default
    private static boolean tryAll = false;

    private PicknPlaceActuator poseAct;

    private MemorySlot<ObjectShapeList> targetsSlot;
    private MemorySlot<ObjectShapeData> targetSlot;

    private static final LengthUnit mm = LengthUnit.MILLIMETER;

    private ObjectShapeList targets = null;
    private ObjectShapeData target;
    private ObjectShapeList recognized = null;
    private Future<GraspReturnType> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenNoResult = configurator.requestExitToken(ExitStatus.ERROR().ps("noresult"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        poseAct = configurator.getActuator("PoseActuatorTobi", PicknPlaceActuator.class);

        tryAll = configurator.requestOptionalBool(KEY_TRY_ALL, tryAll);

        targetsSlot = configurator.getSlot("ObjectShapeListSlot", ObjectShapeList.class);

        targetSlot = configurator.getSlot("PlaceObjectSlot", ObjectShapeData.class);

    }

    @Override
    public boolean init() {
        try {
            if (tryAll) {
                targets = targetsSlot.recall();
            } else {
                target = targetSlot.recall();
            }
        } catch (CommunicationException ex) {
            logger.info(ex.getMessage());
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        if (returnFuture == null) {
            if (tryAll) {
                target = fetchNext();
            }

            if (target == null) {
                logger.fatal("no more objects to place onto");
                return ExitToken.fatal();
            }
            try {
                returnFuture = poseAct.placeObjectOn(target);
            } catch (IOException e) {
                logger.error(e.getMessage(), e);
                return ExitToken.fatal();
            }
            return ExitToken.loop();
        }

        if (!returnFuture.isDone()) {
            logger.debug("placing is not done yet");
            return ExitToken.loop(500);
        }

        try {
            GraspReturnType ret = returnFuture.get();
            logger.debug("ArmController GRT returned: " + ret.getGraspResult());

            if (ret.getGraspResult() == GraspReturnType.GraspResult.SUCCESS) {
                return tokenSuccess;
            } else if (ret.getGraspResult() == GraspReturnType.GraspResult.NO_RESULT) {
                logger.error("Pending, return no result.");
                return tokenNoResult;
            } else if (ret.getGraspResult() == GraspReturnType.GraspResult.ROBOT_CRASHED) {
                logger.error("The arm crashed unrecoverable. Que pena...");
                return ExitToken.fatal();
            } else {
                if (ret.getGraspResult() == GraspReturnType.GraspResult.POSITION_UNREACHABLE) {
                    // try next target

                }
                return ExitToken.loop();
            }
        } catch (ExecutionException | InterruptedException e) {
            logger.debug(e.getMessage(), e);
            logger.error(e.getMessage());
            return ExitToken.fatal();
        }

    }

    ObjectShapeData fetchNext() {
        if (!tryAll) {
            return null;
        }
        if (targets != null) {
            logger.info("fetch next object, remaining: " + targets.size());
            if (targets.size() > 0) {
                ObjectShapeData t = targets.remove(0);
                logger.info("object id:" + t.getId());
                return t;
            }
        }
        return null;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
