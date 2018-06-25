package de.unibi.citec.clf.bonsai.skills.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Set a navigation goal towards a plane.
 * <p>
 * <pre>
 *
 * Options:
 *  #_LR_DEV:   [double] Optional (default: 500)
 *                      -> Deviation to left and right in mm
 *  #_FB_DEV:   [double] Optional (default: 500)
 *                      -> Deviation to front and back in mm
 *  #_YAW       [boolean] Optional (default: false)
 *                      -> Whether to adjust angle towards the plane
 *  #_LENGTH:   [double] Optional (default: 850)
 *                      -> The length of the robot in mm
 *
 * Slots:
 *  PlanePatchSlot: [PlanePatch] [Read]
 *      -> The plane to drive to
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> The navigation goal towards the plane
 *  DistanceSlot: [String] [Write]
 *      -> Distance of the goal from the plane
 *
 * ExitTokens:
 *  success:    Goal computation completed and navgoal saved
 *  error:      Navgoal could not be saved
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Get the current robot position
 *
 * Actuators:
 *
 * </pre>
 *
 * @author llach, jkummert
 */
public class PlanebasedNavGoal extends AbstractSkill {

    private static final String KEY_LR_DEV = "#_LR_DEV";
    private static final String KEY_FB_DEV = "#_FB_DEV";
    private static final String KEY_YAW = "#_YAW";
    private static final String KEY_LENGTH = "#_LENGTH";

    private double lrDev = 500;
    private double fbDev = 500;
    private boolean yaw = false;
    private double robotLength = 850;

    ExitToken tokenSuccess;
    ExitToken tokenError;

    private Sensor<PositionData> robotPositionSensor;

    private MemorySlotReader<PlanePatch> planeSlot;
    private MemorySlotWriter<String> distanceSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private NavigationGoalData navGoal = null;
    private PlanePatch plane = null;
    private PositionData robotPos = null;
    private double dist = 0.3;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        planeSlot = configurator.getReadSlot("PlanePatchSlot", PlanePatch.class);
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        distanceSlot = configurator.getWriteSlot("DistanceSlot", String.class);

        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        lrDev = configurator.requestOptionalDouble(KEY_LR_DEV, lrDev);
        fbDev = configurator.requestOptionalDouble(KEY_FB_DEV, fbDev);
        yaw = configurator.requestOptionalBool(KEY_YAW, yaw);
        robotLength = configurator.requestOptionalDouble(KEY_LENGTH, robotLength);
    }

    @Override
    public boolean init() {
        try {
            plane = planeSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read PlaneSlot: ", ex);
            return false;
        }

        try {
            robotPos = robotPositionSensor.readLast(1000);
            if (robotPos == null) {
                logger.error("RobotPosition is null");
                return false;
            }
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from position sensor", ex);
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        double depth, xNew, yNew;
        Point2D cent;
        PositionData goal;

        if (plane == null) {
            logger.fatal("Plane was null");
            return ExitToken.fatal();
        }

        depth = plane.getBorder().getMaxX(LengthUnit.MILLIMETER) - plane.getBorder().getMinX(LengthUnit.MILLIMETER);

        logger.debug("depth: " + depth);

        cent = plane.getBorder().getCentroid();

        logger.debug("Center:        " + cent);

        xNew = cent.getX(LengthUnit.MILLIMETER) - fbDev - depth;
        yNew = cent.getY(LengthUnit.MILLIMETER) - lrDev;

        logger.debug("fbDev:  " + fbDev + " depth: " + ", substraction:  " + (fbDev - depth));

        goal = new PositionData(xNew, yNew,
                0, new Timestamp(), LengthUnit.MILLIMETER, AngleUnit.RADIAN);

        logger.debug(goal);

        goal.setFrameId(ReferenceFrame.LOCAL);

        PolarCoordinate polar = new PolarCoordinate(goal);

        logger.debug("Polar: " + polar);

        polar.setDistance(polar.getDistance(LengthUnit.MILLIMETER), LengthUnit.MILLIMETER);

        logger.debug("Polar adjust: " + polar);

        navGoal = CoordinateSystemConverter.polar2NavigationGoalData(robotPos, polar.getAngle(AngleUnit.RADIAN),
                polar.getDistance(LengthUnit.MILLIMETER), AngleUnit.RADIAN, LengthUnit.MILLIMETER);

        logger.debug("NavGoal before angle adjustment:       " + navGoal);

        Point2D centGlobal = CoordinateSystemConverter.localToGlobal(cent, robotPos);
        dist = centGlobal.getX(LengthUnit.MILLIMETER) - fbDev;
        dist = dist / 100;

        logger.debug("Center Global: " + centGlobal);

        double alpha = Math.atan((centGlobal.getX(LengthUnit.MILLIMETER) - navGoal.getX(LengthUnit.MILLIMETER))
                / (centGlobal.getY(LengthUnit.MILLIMETER) - navGoal.getY(LengthUnit.MILLIMETER)));

        logger.debug("alpha:  " + alpha);
        if (yaw) {
            logger.debug("using relative yaw");
            navGoal.setYaw(robotPos.getYaw(AngleUnit.RADIAN) - 0.5, AngleUnit.RADIAN); //TODO: should the 0.5 be alpha?
        } else {
            logger.debug("using robot start yaw");
            navGoal.setYaw(robotPos.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
        }

        logger.debug("NavGoal after angle adjustment:       " + navGoal);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                navigationGoalDataSlot.memorize(navGoal);
                distanceSlot.memorize(String.valueOf(dist));
            } catch (CommunicationException ex) {
                logger.error("Could not memorize NaigationGoal or distance", ex);
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
