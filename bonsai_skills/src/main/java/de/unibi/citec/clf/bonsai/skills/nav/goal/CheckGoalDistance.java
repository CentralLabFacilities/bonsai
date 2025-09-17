package de.unibi.citec.clf.bonsai.skills.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Check if the robot is in distance of a navigation goal.
 *
 * <pre>
 *
 * Options:
 *  #_GOAL_DISTANCE:      [double] Optional (default: 2.0)
 *                          -> Distance to check in m
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> Navigation goal to check distance to
 *
 * ExitTokens:
 *  success.WithinDistance: Robot is within #_GOAL_DISTANCE of the goal
 *  success.OutOfDistance:  Robot is out of #_GOAL_DISTANCE of the goal
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Get current robot position
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pdressel, cklarhor, jkummert
 */
public class CheckGoalDistance extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_GOAL_DISTANCE";

    private double minGoalDistance = 2.0;

    private ExitToken tokenSuccessPositiveResponse;
    private ExitToken tokenSuccessNegativeResponse;

    private static final String POSITIVE_RESPONSE = "WithinDistance";
    private static final String NEGATIVE_RESPONSE = "OutOfDistance";

    private Sensor<Pose2D> positionSensor;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessPositiveResponse = configurator.requestExitToken(ExitStatus.SUCCESS().ps(POSITIVE_RESPONSE));
        tokenSuccessNegativeResponse = configurator.requestExitToken(ExitStatus.SUCCESS().ps(NEGATIVE_RESPONSE));

        positionSensor = configurator.getSensor("PositionSensor", Pose2D.class);
        navigationGoalDataSlot = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        minGoalDistance = configurator.requestOptionalDouble(KEY_DISTANCE, minGoalDistance);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        NavigationGoalData navigationGoalData;
        Pose2D currentRobotPosition;
        try {
            navigationGoalData = navigationGoalDataSlot.recall();
            currentRobotPosition = positionSensor.readLast(1000);

        } catch (IOException | InterruptedException | CommunicationException ex) {
            logger.fatal("Could not read navigation slot or from position sensor", ex);
            return ExitToken.fatal();
        }

        if (navigationGoalData == null) {
            logger.fatal("There is nothing in my navigationGoalDataSlot");
            return ExitToken.fatal();
        } else if (currentRobotPosition == null) {
            logger.fatal("Could not read from position sensor");
            return ExitToken.fatal();
        }

        double distance = currentRobotPosition.getDistance(navigationGoalData, LengthUnit.METER);
        logger.info("Distance to object is " + distance + "m" + "  minDistance:" + minGoalDistance);
        if (distance < minGoalDistance) {
            return tokenSuccessPositiveResponse;
        } else {
            return tokenSuccessNegativeResponse;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
