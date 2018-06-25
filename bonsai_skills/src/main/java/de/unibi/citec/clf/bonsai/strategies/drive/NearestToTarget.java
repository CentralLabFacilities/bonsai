package de.unibi.citec.clf.bonsai.strategies.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.navigation.GlobalPlan;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
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

    public NearestToTarget(NavigationActuator nav,
            Sensor<PositionData> robotPositionSensor, ISkillConfigurator conf) throws SkillConfigurationException {
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
            while(!globalPlanRes.isDone() && !globalPlanRes.isCancelled()) {
                Thread.sleep(10); // better exittoken.loop() but how?
            }
            planToTarget = globalPlanRes.get();
        } catch (UnsupportedOperationException e) {
            logger.info("getPlan not supported in actuator, using tryGoal");
            planToTarget = nav.tryGoal(targetGoal);
        } catch (InterruptedException | ExecutionException e) {
            logger.error("Could not recieve global plan ", e);
        }
        if(planToTarget == null) {
            logger.error("Could not make plan.");
            return null;
        }
        logger.debug("This is the plan: ");
        for (int i = 0; i < planToTarget.size(); ++i) {
            logger.debug(i + ": " + planToTarget.get(i));
        }
        logger.debug("Try Goal took: " + (System.nanoTime() - startTime));
        if ((!planToTarget.isEmpty()) && (takeGoal < replan)) {
            logger.info("Target goal reachable");
            planToTarget.get(Math.max(planToTarget.size() - takeGoal, 0)).setYaw(targetGoal.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            return planToTarget.get(Math.max(planToTarget.size() - takeGoal, 0));
        }
        logger.debug("Target Goal not reachable.");
        return null;
    }

    @Override
    protected boolean checkSuccess() {
        logger.debug("checking for success");
        logger.debug("Robot distance to target: " + robotPos.getDistance(targetGoal, LengthUnit.METER));
        return (robotPos.getDistance(targetGoal, LengthUnit.METER) < maxDistanceSuccess);
    }
}
