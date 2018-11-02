package de.unibi.citec.clf.bonsai.ros.actuators;

import actionlib_msgs.GoalID;
import actionlib_msgs.GoalStatus;
import com.github.rosjava_actionlib.ActionClient;
import com.github.rosjava_actionlib.ActionFuture;
import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.geometry.Twist3D;
import de.unibi.citec.clf.btl.data.geometry.AngularVelocity3D;
import de.unibi.citec.clf.btl.data.geometry.Velocity3D;
import de.unibi.citec.clf.btl.data.navigation.*;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import geometry_msgs.Point;
import geometry_msgs.Pose;
import geometry_msgs.Twist;
import geometry_msgs.Quaternion;
import move_base_msgs.MoveBaseActionFeedback;
import move_base_msgs.MoveBaseActionGoal;
import move_base_msgs.MoveBaseActionResult;
import move_base_msgs.MoveBaseGoal;
import org.ros.message.Duration;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;
import org.ros.concurrent.Rate;
import org.ros.node.topic.PublisherListener;
import std_msgs.Header;

import javax.vecmath.Quat4d;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;


/**
 * @author llach
 */
public class RosMoveBaseNavigationActuator extends RosNode implements NavigationActuator {

    class CommandResultFuture implements Future<CommandResult> {

        private ActionFuture<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> fut;

        public CommandResultFuture(ActionFuture<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> fut) {
            this.fut = fut;
        }

        @Override
        public boolean cancel(boolean b) {
            return fut.cancel(b);
        }

        @Override
        public boolean isCancelled() {
            return fut.isCancelled();
        }

        @Override
        public boolean isDone() {
            return fut.isDone();
        }

        @Override
        public CommandResult get() throws InterruptedException, ExecutionException {
            try {
                return get(0, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                throw new ExecutionException(e);
            }
        }

        @Override
        public CommandResult get(long l, TimeUnit timeUnit) throws InterruptedException, ExecutionException, TimeoutException {
            MoveBaseActionResult res = fut.get(l, timeUnit);
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

    String topic;

    String moveRelativeTopic;
    private Publisher<geometry_msgs.Twist> moveRelativePublisher;

    private GraphName nodeName;
    private ActionClient<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> ac;

    private GoalID lastAcGoalId;

    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public RosMoveBaseNavigationActuator(GraphName gn) {
        initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {
        this.topic = conf.requestValue("topic");
        this.moveRelativeTopic = conf.requestValue("moveRelativeTopic");
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
        ac = new ActionClient(connectedNode, this.topic, MoveBaseActionGoal._TYPE, MoveBaseActionFeedback._TYPE, MoveBaseActionResult._TYPE);
        moveRelativePublisher = connectedNode.newPublisher(this.moveRelativeTopic, Twist._TYPE);
        lastAcGoalId = null;

        if (ac.waitForActionServerToStart(new Duration(2.0))) {
            initialized = true;
            logger.debug("RosMoveBase NavAct started");
        }

    }

    @Override
    public void destroyNode() {
        if (ac != null) ac.finish();
    }

    @Override
    public void setGoal(NavigationGoalData data) throws IOException {
        if (data.getFrameId().isEmpty()) {
            data.setFrameId("map");
        }
        this.navigateToCoordinate(data);
    }

    @Override
    public GlobalPlan tryGoal(NavigationGoalData data) throws IOException {
        throw new UnsupportedOperationException();
    }

    @Override
    public Future<GlobalPlan> getPlan(NavigationGoalData data, PositionData startPos) throws IOException {
        throw new UnsupportedOperationException();
    }

    @Override
    public void drive(double distance, LengthUnit unit, double speed, SpeedUnit sunit) throws IOException {
        throw new UnsupportedOperationException();
    }

    @Override
    public void turn(double angle, AngleUnit unit, double speed, RotationalSpeedUnit sunit) throws IOException {
        throw new UnsupportedOperationException();
    }

    @Override
    public void manualStop() throws IOException {
        if (lastAcGoalId != null) {
            ac.sendCancel(lastAcGoalId);
        } else {
            final NavigationGoalData goal = new NavigationGoalData();
            goal.setFrameId("base_link");
            final Future<CommandResult> commandResultFuture = navigateToCoordinate(goal);
            commandResultFuture.cancel(true);
            ac.sendCancel(lastAcGoalId);
        }
    }

    @Override
    public NavigationGoalData getCurrentGoal() throws IOException {
        throw new UnsupportedOperationException(); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public Future<CommandResult> moveRelative(DriveData drive, TurnData turn) {
        // first drive, then turn
        double duration = 0.03;

        double velX = 0.0;
        double velY = 0.0;
        double dist = 0.0;
        double driveSpeed = 0.01;

        if (drive != null) {
            driveSpeed = drive.getSpeed(SpeedUnit.METER_PER_SEC);
            dist = drive.getDistance(LengthUnit.METER);
            velX = driveSpeed * drive.getDirection().getX(LengthUnit.METER) / drive.getDirection().getLength(LengthUnit.METER);
            velY = driveSpeed * drive.getDirection().getY(LengthUnit.METER) / drive.getDirection().getLength(LengthUnit.METER);
        }
        int driveNum = (int) ((dist / driveSpeed + 0.5) / duration);

        double turnSpeed = 0.0;
        double turnAngle = 0.0;

        if (turn != null) {
            turnSpeed = turn.getSpeed(RotationalSpeedUnit.RADIANS_PER_SEC);
            turnAngle = turn.getAngle(AngleUnit.RADIAN);
        }
        int turnNum;
        if (turnSpeed != 0) {
            turnNum = (int) ((turnAngle / turnSpeed + 0.5) / duration);
        } else {
            turnNum = 0;
        }


        Velocity3D vel = new Velocity3D(velX, velY, 0.0, SpeedUnit.METER_PER_SEC);
        AngularVelocity3D angVel = new AngularVelocity3D(0.0, 0.0, turnSpeed, RotationalSpeedUnit.RADIANS_PER_SEC);
        Twist3D driveTwist = new Twist3D(vel, angVel);
        driveTwist.setLinear(vel);
        Twist3D turnTwist = new Twist3D(vel, angVel);
        turnTwist.setAngular(angVel);

        try {
            final geometry_msgs.Twist driveMsg = MsgTypeFactory.getInstance().createMsg(driveTwist, Twist.class);
            final geometry_msgs.Twist turnMsg = MsgTypeFactory.getInstance().createMsg(turnTwist, Twist.class);
            final boolean done;
            logger.debug("publish drive: "+driveMsg.getLinear().getX()+", "+driveMsg.getLinear().getY()+", "+driveMsg.getLinear().getZ()+"for "+(duration*driveNum)+" seconds");
            logger.debug("publish turn: "+driveMsg.getAngular().getX()+", "+driveMsg.getAngular().getY()+", "+driveMsg.getAngular().getZ()+"for "+(duration*turnNum)+" seconds");

            /*final Thread thread = new Thread() {
                public void run() {
                    try {
                        for (int i = 0; i < driveNum; i++) {
                            moveRelativePublisher.publish(driveMsg);
                            Thread.sleep(duration * 1000);
                        }
                        for (int i = 0; i < turnNum; i++) {
                            logger.debug("turn "+i);
                            moveRelativePublisher.publish(turnMsg);
                            Thread.sleep(duration * 1000);
                        }
                    } catch (java.lang.InterruptedException ex) {
                        return;
                    }
                }
            };*/
            done = true;

            return new Future<CommandResult>() {

                @Override
                public boolean cancel(boolean b) {
                    //thread.interrupt();
                    return true;
                }

                @Override
                public boolean isCancelled() {
                    return true;
                }

                @Override
                public boolean isDone() {
                    return done;
                }

                @Override
                public CommandResult get() throws InterruptedException, ExecutionException {
                    int millis = (int) (duration * 1000);
                    logger.debug("publish every "+millis+"seconds");
                    for (int i = 0; i < driveNum; i++) {
                        moveRelativePublisher.publish(driveMsg);
                        Thread.sleep(millis);
                    }
                    long time1 = System.currentTimeMillis();
                    for (int i = 0; i < turnNum; i++) {
                        moveRelativePublisher.publish(turnMsg);
                        Thread.sleep(millis);
                    }
                    logger.debug("turn took: " + (System.currentTimeMillis()-time1));

                    if (done) {
                        return new CommandResult("moveRelative", CommandResult.Result.SUCCESS, 0);
                    } else {
                        return new CommandResult("moveRelative", CommandResult.Result.UNKNOWN_ERROR, 1);
                    }
                }

                @Override
                public CommandResult get(long l, TimeUnit timeUnit) throws InterruptedException, ExecutionException, TimeoutException {
                    int millis = (int) (duration * 1000);
                    logger.debug("publish every "+millis+"seconds");
                    for (int i = 0; i < driveNum; i++) {
                        moveRelativePublisher.publish(driveMsg);
                        Thread.sleep(millis);
                    }
                    for (int i = 0; i < turnNum; i++) {
                        moveRelativePublisher.publish(turnMsg);
                        Thread.sleep(millis);
                    }
                    if (done) {
                        return new CommandResult("moveRelative", CommandResult.Result.SUCCESS, 0);
                    } else {
                        return new CommandResult("moveRelative", CommandResult.Result.UNKNOWN_ERROR, 1);
                    }
                }
            };

        } catch (RosSerializer.SerializationException e) {
            logger.warn("could not serialize twist");
        }

        throw new UnsupportedOperationException("move relative could not be executed");
    }


    @Override
    public Future<CommandResult> navigateToCoordinate(NavigationGoalData data) {
        MoveBaseActionGoal msg = ac.newGoalMessage();

        MoveBaseGoal goal = msg.getGoal();
        try {
            final Pose pose = MsgTypeFactory.getInstance().createMsg((PositionData) data, Pose.class);
            goal.getTargetPose().setPose(pose);
            goal.getTargetPose().getHeader().setFrameId(data.getFrameId());
        } catch (RosSerializer.SerializationException e) {
            logger.warn("could not serialize PositionData, using manual conversion");

            Point position = goal.getTargetPose().getPose().getPosition();
            Quaternion orientation = goal.getTargetPose().getPose().getOrientation();
            Rotation3D rot = new Rotation3D(0.0, 0.0, 1.0, data.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
            Quat4d q = rot.getQuaternion();
            position.setX(data.getX(LengthUnit.METER));
            position.setY(data.getY(LengthUnit.METER));
            position.setZ(0.0);
            orientation.setX(q.x);
            orientation.setY(q.y);
            orientation.setZ(q.z);
            orientation.setW(q.w);

            Header h = goal.getTargetPose().getHeader();
            h.setFrameId(data.getFrameId());
        }

        lastAcGoalId = msg.getGoalId();
        ActionFuture<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> fut = this.ac.sendGoal(msg);

        return new CommandResultFuture(fut);
    }

    @Override
    public Future<CommandResult> navigateToInterrupt(NavigationGoalData data) {
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public Future<CommandResult> navigateRelative(NavigationGoalData data) {
        throw new UnsupportedOperationException("Not supported yet."); //To change body of generated methods, choose Tools | Templates.
    }

    @Override
    public void clearCostmap() throws IOException {
        throw new UnsupportedOperationException();
    }

}
