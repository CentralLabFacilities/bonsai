package de.unibi.citec.clf.bonsai.skills.deprecated.nav;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.vision3d.PlanePatch;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 *
 * @author see git
 */
public class DriveToTable extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenErrorNoTable;

    private MemorySlot<PlanePatch> tableSlot;
    private MemorySlot<NavigationGoalData> navSlot;
    private Sensor<PositionData> robotPositionSensor;
    NavigationGoalData navGoal;

    //private ArmController180 armController;
    //private PoseActuatorTobi poseAct;
//    private CoordinateTransformer coordinateTransformer;
    private static final LengthUnit mm = LengthUnit.MILLIMETER;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenErrorNoTable = configurator.requestExitToken(ExitStatus.ERROR().ps("noTable"));
        navSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        tableSlot = configurator.getSlot("PlanePatchSlot", PlanePatch.class);
        // poseAct = configurator.getActuator("PoseActuatorTobi", PoseActuatorTobi.class);
        robotPositionSensor = configurator.getSensor("PositionSensor", PositionData.class);
//        coordinateTransformer = configurator.getCoordinateTransformer();
    }

    @Override
    public boolean init() {
        //armController = new ArmController180(poseAct);
        return true;
    }

    @Override
    public ExitToken execute() {
        PositionData robotPosition = null;
        try {
            robotPosition = robotPositionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
        }
        if (robotPosition == null) {
            logger.error("robotPosition was null --> loop");
            return ExitToken.loop(250);
        }
        PlanePatch table = null;
        try {
            table = tableSlot.recall();
        } catch (CommunicationException ex) {
            logger.info(ex.getMessage());
        }
        if (table == null) {
            logger.error("table is null");
            return tokenErrorNoTable;
        }

        Point3D center = table.calculateCenterPoint();
        //   try {
        logger.debug("table: " + table);
        logger.debug("table center: " + center);

        //transformation doesn't work because of reasons. currently working on a fix.
//            center = coordinateTransformer.transform(center, "katana_base_link");
        logger.debug("table (katana_base_link): " + center);

        logger.debug("TRY TO DRIVE INTO TABLE");
        PositionData p = new PositionData(center.getZ(mm), -center.getY(mm),
                0, new Timestamp(), mm, AngleUnit.RADIAN);
        p.setFrameId(center.getFrameId());
        logger.info("table pos rel was: " + p);
        logger.info("robotYaw is " + robotPosition.getYaw(AngleUnit.RADIAN));
        PositionData pos = CoordinateSystemConverter.localToGlobal(p, robotPosition);
        logger.info("Table pos is: " + pos);
        navGoal = new NavigationGoalData(pos);
        logger.info("goal yaw is " + navGoal.getYaw(AngleUnit.RADIAN));
        // pos.setYaw(robotPosition.getGlobalAngle(pos, AngleUnit.RADIAN), AngleUnit.RADIAN);

        //} catch (TransformException e) {
//            logger.error("can not transform coordinated. " + e.getMessage());
//            return tokenError;
//        }
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
            return curToken;
        }

        return curToken;
    }

}
