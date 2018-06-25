package de.unibi.citec.clf.bonsai.skills.deprecated.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.skills.nav.goal.PlanebasedNavGoal;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author llach
 */
public class PlaneNavGoal extends AbstractSkill {

    private static final String KEY_LR_DEV = "#_LR_DEV";
    private static final String KEY_FB_DEV = "#_FB_DEV";
    private static final String KEY_YAW = "#_YAW";
    private static final String KEY_LENGTH = "#_LENGTH";

    private double lrDev = 1.1;
    private double fbDev = 1.1;
    private boolean yaw = false;
    private double dist = 0.3;
    //standard length for meka
    private double robotLength = 850;

    private MemorySlot<PlanePatch> planeSlot;
    private MemorySlot<String> distanceSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;
    private Sensor<PositionData> robotPositionSensor;

    private NavigationGoalData navGoal = null;
    private PlanePatch plane = null;
    private PositionData robotPos = null;

    ExitToken tokenSuccess;
    ExitToken tokenError;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        planeSlot = configurator.getSlot("PlanePatchSlot", PlanePatch.class);
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        distanceSlot = configurator.getSlot("DistanceSlot", String.class);

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
            logger.fatal("Could not read PlaneSlot: " + ex);
            Logger.getLogger(PlanebasedNavGoal.class.getName()).log(Level.SEVERE, null, ex);
            return false;
        }

        try {
            robotPos = robotPositionSensor.readLast(1000);
            if (robotPos == null) {
                logger.error("RobotPosition is null");
                robotPos = robotPositionSensor.readLast(1000);
            }
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
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

        dist = cent.getX(LengthUnit.METER) - fbDev;
        System.out.println("dist: " + dist + "m");

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            distanceSlot.memorize(String.valueOf(dist));
        } catch (CommunicationException ex) {
            logger.error("Could not memorize NaigationGoal");
            Logger.getLogger(PlanebasedNavGoal.class.getName()).log(Level.SEVERE, null, ex);
            return tokenError;
        }
        return curToken;
    }

}
