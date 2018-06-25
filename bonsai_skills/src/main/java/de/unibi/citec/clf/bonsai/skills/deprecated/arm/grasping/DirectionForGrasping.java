package de.unibi.citec.clf.bonsai.skills.deprecated.arm.grasping;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 *
 * @author mholland
 */
public class DirectionForGrasping extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private MemorySlot<NavigationGoalData> navSlot;
    private MemorySlot<PositionData> globalObjectPositionSlot;

    private Sensor<PositionData> robotPositionSensor;
    PositionData globalObjectPosition;
    NavigationGoalData navGoal;
    private PositionData robot;

    //private PoseActuatorTobi poseAct;
    private static final LengthUnit mm = LengthUnit.MILLIMETER;
    Point3D targetPoint;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        navSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        //poseAct = configurator.getActuator("PoseActuatorTobi", PoseActuatorTobi.class);
        globalObjectPositionSlot = configurator.getSlot(
                "GlobalObjectPositionSlot", PositionData.class);

    }

    @Override
    public boolean init() {

        try {
            robot = robotPositionSensor.readLast(200);
        } catch (IOException | InterruptedException ex) {
            logger.error("could not read robot pos", ex);
        }
        //
        if (robot == null) {
            logger.error("robot pos null");
            return false;
        }

        try {
            //robot = poseAct.
            globalObjectPosition = globalObjectPositionSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal(ex.getMessage());
            return false;
        }

        if (globalObjectPosition == null) {
            logger.error("global object = null");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        logger.debug("global object pos: " + globalObjectPosition);
        PositionData p = new PositionData(0, 0, 0, new Timestamp(), mm, AngleUnit.RADIAN);

        navGoal = (NavigationGoalData)p;
        navGoal.setFrameId(PositionData.ReferenceFrame.LOCAL);

        double angle = robot.getRelativeAngle(globalObjectPosition, AngleUnit.RADIAN);
        logger.debug("robotRelAngle to obj: " + angle);
        navGoal.setYaw(angle, AngleUnit.RADIAN);

        logger.debug("TRY TO TURN TO OBJECT");
        logger.debug("navGoal" + navGoal.toString());

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (navGoal != null) {
            try {
                navSlot.memorize(navGoal);

            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
            return tokenSuccess;
        }

        return curToken;
    }

}
