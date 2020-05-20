package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Interface for Grasping
 *
 * @author lruegeme
 */
public interface ManipulationActuator extends Actuator {

    public enum MoveitResult {
        SUCCESS(1),
        FAILURE(99999),

        PLANNING_FAILED(-1),
        INVALID_MOTION_PLAN(-2),
        MOTION_PLAN_INVALIDATED_BY_ENVIRONMENT_CHANGE(-3),
        CONTROL_FAILED(-4),
        UNABLE_TO_AQUIRE_SENSOR_DATA(-5),
        TIMED_OUT(-6),
        PREEMPTED(-7),

        START_STATE_IN_COLLISION(-10),
        START_STATE_VIOLATES_PATH_CONSTRAINTS(-11),

        GOAL_IN_COLLISION(-12),
        GOAL_VIOLATES_PATH_CONSTRAINTS(-13),
        GOAL_CONSTRAINTS_VIOLATED(-14),

        INVALID_GROUP_NAME(-15),
        INVALID_GOAL_CONSTRAINTS(-16),
        INVALID_ROBOT_STATE(-17),
        INVALID_LINK_NAME(-18),
        INVALID_OBJECT_NAME(-19),

        FRAME_TRANSFORM_FAILURE(-21),
        COLLISION_CHECKING_UNAVAILABLE(-22),
        ROBOT_STATE_STALE(-23),
        SENSOR_INFO_STALE(-24),
        NO_IK_SOLUTION(-31);

        private int id;

        MoveitResult(int id) {
            this.id = id;
        }

        public static MoveitResult getById(int id) {
            for (MoveitResult e : values()) {
                if (e.id == id) return e;
            }
            return FAILURE;
        }
    }

    Future<MoveitResult> graspObject(@Nonnull ObjectShapeData osd, @Nullable String group) throws IOException;

    Future<MoveitResult> graspObject(@Nonnull String objectName, @Nullable String group) throws IOException;

    /**
     * Place the object somewhere on the given surface.
     *
     * @param supportSurface name of the surface
     * @param group Group to use (for multiple arms)
     * @return
     * @throws IOException
     */
    Future<MoveitResult> placeObject(@Nonnull String supportSurface, @Nullable String group) throws IOException;

    /**
     *  Place the object on the given pose.
     *
     * @param position position to place at
     * @param supportSurface name of the surface to place onto
     * @param group Group to use (for multiple arms)
     * @return
     * @throws IOException
     */
    Future<MoveitResult> placeObject(@Nonnull Pose3D position, @Nullable String supportSurface, @Nullable String group) throws IOException;

    /**
     * Places the Object ontop of the given area center.
     *
     * @param area
     * @param supportSurface name of the surface to place onto
     * @param group Group to use (for multiple arms)
     * @return
     * @throws IOException
     */
    Future<MoveitResult> placeObjectOnArea(@Nonnull BoundingBox3D area, @Nullable String supportSurface, @Nullable String group) throws IOException;

    /**
     * Places the Object into the given box.
     *
     * @param area to place the object in
     * @param group Moveit Group to use (for multiple arms)
     * @return
     * @throws IOException
     */
    Future<MoveitResult> placeObjectInArea(@Nonnull BoundingBox3D area, @Nullable String group) throws IOException;
}
