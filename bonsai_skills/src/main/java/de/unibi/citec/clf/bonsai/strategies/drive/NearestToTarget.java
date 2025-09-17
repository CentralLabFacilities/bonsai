package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.GlobalPlan;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * The Robot search the Nearest Position with Orientation to Navigation Goal.
 *
 * @author nneumann
 */
public class NearestToTarget extends DriveStrategyWithTryGoal {

    GlobalPlan oldPlan = null;

    public NearestToTarget(NavigationActuator nav,
                           Sensor<Pose2D> robotPositionSensor, ISkillConfigurator conf) throws SkillConfigurationException {
        super(nav, robotPositionSensor, conf);
    }

    @Override
    protected NavigationGoalData findBestGoal() throws IOException {
        logger.debug("Coordinate Tolerance of target goal: " + targetGoal.getCoordinateTolerance(LengthUnit.METER));
        long startTime = System.nanoTime();
        GlobalPlan planToTarget = null;
        Future<GlobalPlan> globalPlanRes;
        try {
            globalPlanRes = nav.getPlan(targetGoal, robotPos);
            while (!globalPlanRes.isDone() && !globalPlanRes.isCancelled()) {
                Thread.sleep(10); // better exittoken.loop() but how?
            }
            planToTarget = globalPlanRes.get();
        } catch (UnsupportedOperationException e) {
            logger.info("getPlan not supported in actuator, using tryGoal");
            planToTarget = nav.tryGoal(targetGoal);
        } catch (InterruptedException | ExecutionException e) {
            logger.error("Could not recieve global plan ", e);
        }
        if (planToTarget == null || planToTarget.size() <= 1) {
            if (oldPlan == null || oldPlan.isEmpty()) {
                if (closerSteps < closerMaxSteps) {
                    logger.warn("Could not make plan. Setting Target nearer to robot");

                    PolarCoordinate targetPolar;
                    //If targetGoal is already a LOCAL target, the conversion globalToLocal is not necessary
                    if(targetGoal.getFrameId().equals(Pose2D.ReferenceFrame.LOCAL.getFrameName())) {
                        targetPolar = new PolarCoordinate(targetGoal);
                    } else {
                        targetPolar = new PolarCoordinate(MathTools.globalToLocal(
                                targetGoal, robotPos));
                    }

                    double distance = targetPolar.getDistance(LengthUnit.METER);
                    logger.debug("Old goal distance: " + distance);
                    
                    if (distance - (closerSteps * closerStepSize) < 0) {
                        distance = 0;
                    } else {
                        distance = distance - (closerSteps * closerStepSize);
                    }
                    logger.debug("New goal distance: " + distance);
                    
                    ++closerSteps;

                    return CoordinateSystemConverter.polar2NavigationGoalData(
                            robotPos, targetPolar.getAngle(AngleUnit.RADIAN), distance, AngleUnit.RADIAN, LengthUnit.METER);
                } else {
                    logger.debug("Setting goal nearer to robot exausted. Giving up.");
                    return null;
                }
            } else {
                planToTarget = oldPlan;
            }
        }
        oldPlan = planToTarget;
        logger.debug("Try Goal took: " + (System.nanoTime() - startTime));
        if ((!planToTarget.isEmpty()) && (takeGoal < replan)) {
            logger.info("Target goal reachable");
            planToTarget.get(Math.max(planToTarget.size() - takeGoal, 0)).setYaw(targetGoal.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            return planToTarget.get(Math.max(planToTarget.size() - takeGoal, 0));
        }
        logger.error("Already took " + replan + " replan steps. Giving up.");
        return null;
    }

    @Override
    protected boolean checkSuccess() {
        logger.debug("checking for success");
        logger.debug("Robot distance to target: " + robotPos.getDistance(targetGoal, LengthUnit.METER));
        return (robotPos.getDistance(targetGoal, LengthUnit.METER) < maxDistanceSuccess);
    }
}
