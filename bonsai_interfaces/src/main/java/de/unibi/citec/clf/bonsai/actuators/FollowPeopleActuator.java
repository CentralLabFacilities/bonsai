package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

public interface FollowPeopleActuator extends Actuator {
    Future<Boolean> startFollowing(String uuid) throws InterruptedException, ExecutionException;
    void cancel();
}
