package de.unibi.citec.clf.bonsai.ros.helper;

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
 * @param <M>
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
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public CommandResult get(long l, TimeUnit tu) throws InterruptedException, ExecutionException, TimeoutException {
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    private static CommandResult toCommandResult(MoveBaseActionResult res) {

        MoveBaseResult moveBaseResult = res.getResult();
        //Not much info here 

        CommandResult.Result status = CommandResult.Result.SUCCESS;
        int errorCode = 0;

        CommandResult command = new CommandResult("move_base nav", status, errorCode);

        return command;
    }

}
