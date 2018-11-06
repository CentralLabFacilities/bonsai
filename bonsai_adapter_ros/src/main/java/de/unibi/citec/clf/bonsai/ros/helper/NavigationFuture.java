package de.unibi.citec.clf.bonsai.ros.helper;

import actionlib_msgs.GoalStatus;
import com.github.rosjava_actionlib.ActionFuture;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import move_base_msgs.MoveBaseActionFeedback;
import move_base_msgs.MoveBaseActionGoal;
import move_base_msgs.MoveBaseActionResult;
import move_base_msgs.MoveBaseResult;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public class NavigationFuture implements Future<CommandResult> {

    private static org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(NavigationFuture.class);

    ActionFuture<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> action;

    public NavigationFuture(ActionFuture<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> f) {
        action = f;
    }

    @Override
    public boolean cancel(boolean bln) {
        return action.cancel(bln);
    }

    @Override
    public boolean isCancelled() {
        return action.isCancelled();
    }

    @Override
    public boolean isDone() {
        return action.isDone();
    }

    @Override
    public CommandResult get() throws InterruptedException, ExecutionException {
        return toCommandResult(action.get());
    }

    @Override
    public CommandResult get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
        return toCommandResult(action.get(l,tu));
    }

    private static CommandResult toCommandResult(MoveBaseActionResult res) {

        MoveBaseResult moveBaseResult = res.getResult();
        //Not much info here
        GoalStatus result = res.getStatus();
        //TODO: USE CORRECT ERROR CODES
        if (result.getStatus() == GoalStatus.SUCCEEDED) {
            return new CommandResult("SUCCESS", CommandResult.Result.SUCCESS, 0);
        } else if (result.getStatus() == GoalStatus.ABORTED) {
            return new CommandResult("CANCELLED", CommandResult.Result.CANCELLED, 1);
        } else {
            return new CommandResult("FAILED", CommandResult.Result.UNKNOWN_ERROR, 2);
        }
    }

}
