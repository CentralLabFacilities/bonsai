package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Calculates a good point to drive to for grasping a given object.
 * <pre>
 *
 * Options:
 *  #_DISTANCE:   [double] Optional (default: "0.25")
 *                                  -> The distance the robot will keep from the object
 *
 * Slots:
 *  ObjectShapeDataListSlot: [ObjectShapeList] [Write]
 *      -> Memory slot with exactly one ObjectShapeData, which will be the target of this skill
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Memory slot to store the target
 *
 * ExitTokens:
 *  success:                Target set successfully
 *  error:                  Something went wrong
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class SetTargetByObjectShapeData extends AbstractSkill {

    private static final String KEY_DISTANCE = "#_DISTANCE";

    private ExitToken tokenSuccess;

    private MemorySlotReader<ObjectShapeList> objectShapeListSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;


    private ObjectShapeList objectShapeList;
    private NavigationGoalData navigationGoalData;
    private double distance = 0.25;

    private LengthUnit LU = LengthUnit.METER;
    private AngleUnit AU = AngleUnit.RADIAN;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        distance = configurator.requestOptionalDouble(KEY_DISTANCE, distance);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        objectShapeListSlot = configurator.getReadSlot("ObjectShapeDataListSlot", ObjectShapeList.class);
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

    }

    @Override
    public boolean init() {

        try {
            objectShapeList = objectShapeListSlot.recall();
        } catch (CommunicationException e) {
            logger.error(e.getMessage());
            return false;
        }
        if(objectShapeList == null){
            logger.error("The ObjectShapeDataListSlot was not set.");
            return false;
        }
        if(objectShapeList.isEmpty()){
            logger.error("The ObjectShapeDataListSlot was empty.");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        ObjectShapeData obj = objectShapeList.get(0);
        Rotation3D rot = obj.getBoundingBox().getPose().getRotation();
        double yawObj = rot.getYaw(AngleUnit.RADIAN);
        PositionData pos = new PositionData(obj.getCenter().getX(LU), obj.getCenter().getY(LU), yawObj, LU, AU);
        logger.debug("Position of the Object: " + pos.toString());
        logger.debug("Rotation quad of the Object: " + rot.getQuaternion().toString());

        navigationGoalData = CoordinateSystemConverter.polar2NavigationGoalData(pos, 0.0, distance, AU, LU);
        navigationGoalData.setYaw((new Point2D(pos.getX(LU), pos.getY(LU))).getAngle(pos), AU);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (navigationGoalData != null) {
                try {
                    navigationGoalDataSlot.memorize(navigationGoalData);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }

}
