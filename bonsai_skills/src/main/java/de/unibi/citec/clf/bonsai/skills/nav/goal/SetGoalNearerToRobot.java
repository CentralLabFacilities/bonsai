package de.unibi.citec.clf.bonsai.skills.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Set a navigation goal closer to the robot.
 * <p>
 * <pre>
 *
 * Options:
 *  #_CLOSER:         [double] Optional (default: 500)
 *                      -> Set navigation goal this much closer in mm
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read and Write]
 *      -> Navigation goal to modify
 *
 * ExitTokens:
 *  success:    New navigation goal computed and saved successfully
 *  error:      Navigation goal could not by saved
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Get the current robot position
 *
 * Actuators:
 *
 * </pre>
 *
 * @author jkummert
 */
public class SetGoalNearerToRobot extends AbstractSkill {

    private static final String KEY_CLOSER = "#_CLOSER";

    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    private Sensor<PositionData> robotPositionSensor;

    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlotWrite;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlotRead;

    private NavigationGoalData goal;
    private NavigationGoalData newGoal;
    private double closer = 500;
    PositionData robotPos;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        navigationGoalDataSlotWrite = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        navigationGoalDataSlotRead = configurator.getReadSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        closer = configurator.requestOptionalDouble(KEY_CLOSER, closer);
    }

    @Override
    public boolean init() {
        try {
            goal = navigationGoalDataSlotRead.recall();
            if (goal == null) {
                logger.error("your nav goal slot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.error("Could not read navigation goal slot", ex);
            return false;
        }

        try {
            robotPos = robotPositionSensor.readLast(5000);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from position sensor", ex);
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        PolarCoordinate goalPosPolar = new PolarCoordinate(MathTools.globalToLocal(
                goal, robotPos));

        double distance = goalPosPolar.getDistance(LengthUnit.MILLIMETER);
        logger.debug("Distance to old goal: " + distance);
        if (distance < closer) {
            distance = 0;
        } else {
            distance = distance - closer;
        }
        logger.debug("Distance to new goal: " + distance);

        newGoal = CoordinateSystemConverter.polar2NavigationGoalData(
                robotPos, goalPosPolar.getAngle(AngleUnit.RADIAN), distance, AngleUnit.RADIAN, LengthUnit.MILLIMETER);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                navigationGoalDataSlotWrite.memorize(newGoal);
            } catch (CommunicationException ex) {
                logger.error("Could not save navigation goal", ex);
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
