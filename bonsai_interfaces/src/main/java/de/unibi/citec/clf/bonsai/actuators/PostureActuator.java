package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.io.IOException;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;
import java.util.List;
import java.util.concurrent.Future;

public interface PostureActuator extends Actuator {

    /**
     * Execute a defined Motion
     * @param motion
     * @param group
     * @return
     */
    Future<Boolean> executeMotion(@Nonnull String motion, @Nullable String group);

    /**
     * Assume a predefined Pose
     * @param pose
     * @param group
     * @return
     */
    Future<Boolean> assumePose(@Nonnull String pose, @Nullable String group);


    List<String> listMotions(@Nullable String group);

}
