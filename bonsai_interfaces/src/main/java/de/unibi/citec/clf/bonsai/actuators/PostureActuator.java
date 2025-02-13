package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;
import java.util.List;
import java.util.concurrent.Future;

public interface PostureActuator extends Actuator {

    /**
     * Execute a named Motion
     * @param motion
     * @param group
     * @return
     */
    Future<Boolean> executeMotion(@Nonnull String motion, @Nullable String group);

    /**
     * Move to a named Pose
     * @param pose
     * @param group
     * @param upright
     * @return
     */

    Future<Boolean> moveTo(@Nonnull String pose, @Nullable String group, boolean upright);
    Future<Boolean> moveTo(@Nonnull String pose, @Nullable String group);

    /**
     * Checks if a defined Pose is reached
     * @param pose
     * @param group
     * @return
     */
    Future<Boolean> isInPose(@Nonnull String pose, @Nullable String group);


    List<String> listMotions(@Nullable String group);

}
