package de.unibi.citec.clf.bonsai.skills.ecwm.grasping;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.ecwm.Entity;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.lang.annotation.Target;

/**
 * Will modify a target pose with x and y values.
 * <pre>
 *
 * Options:
 *      val X_TRANS: The translation/shift in direction of the x-axis (in m)
 *      val Y_TRANS: The translation/shift in direction of the y-axis (in m)
 * Slots:
 *  Entity: [Entity] [Read]
 *      -> the entity of which the initial pose is taken to modify (as reference)
 *  TargetPose: [TargetPose] [Write]
 *       -> the final TargetPose; can be used in PlaceEntity, for example
 *
 * ExitTokens:
 * success:                The target pose was successfully calculated and written in slot
 * error:                  Reading entity or Target Pose writing failed
 * fatal:                  A different error occurred
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGraspingActuator]
 *
 * </pre>
 *
 * @author klammers
 */

public class SetTargetPose extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private MemorySlotReader<Entity> entityReader;

    private double x_trans = 0.0;
    private double y_trans = 0.0;

    private Entity entity;
    private MemorySlotWriter<Pose3D> targetWriter;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        entityReader = configurator.getReadSlot("Entity", Entity.class);
        targetWriter = configurator.getWriteSlot("TargetPose", Pose3D.class);
        x_trans = configurator.requestOptionalDouble("#_X_TRANS", (double) x_trans);
        y_trans = configurator.requestOptionalDouble("#_Y_TRANS", (double) y_trans);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            entity = entityReader.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not recall from entity slot");
            return tokenError;
        }

        Pose3D entity_pose = entity.getPose();

        entity_pose = new Pose3D(new Point3D(entity_pose.getTranslation().getX(LengthUnit.METER) + x_trans,
                                        entity_pose.getTranslation().getY(LengthUnit.METER) + y_trans,
                                        entity_pose.getTranslation().getZ(LengthUnit.METER),
                                        LengthUnit.METER),
                                    new Rotation3D(),
                                    entity_pose.getFrameId());

        try {
            targetWriter.memorize(entity_pose);
        } catch (CommunicationException c) {
            logger.error("Could not write new target pose");
            return tokenError;
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken exitToken) {
        return exitToken;
    }
}
