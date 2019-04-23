package de.unibi.citec.clf.bonsai.ros.actuators;

import actionlib_msgs.GoalID;
import com.github.rosjava_actionlib.ActionClient;
import com.github.rosjava_actionlib.ActionFuture;
import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.InitializationException;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import de.unibi.citec.clf.bonsai.ros.helper.NavigationFuture;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.*;
import de.unibi.citec.clf.btl.data.navigation.*;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import de.unibi.citec.clf.btl.ros.RosSerializer;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import geometry_msgs.Point;
import geometry_msgs.Pose;
import geometry_msgs.Quaternion;
import geometry_msgs.Twist;
import move_base_msgs.MoveBaseActionFeedback;
import move_base_msgs.MoveBaseActionGoal;
import move_base_msgs.MoveBaseActionResult;
import move_base_msgs.MoveBaseGoal;
import org.jboss.netty.util.internal.NonReentrantLock;
import org.ros.message.Duration;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Publisher;
import org.ros.node.topic.Subscriber;
import std_msgs.Header;

import javax.annotation.Nonnull;
import javax.annotation.Nullable;
import javax.vecmath.Quat4d;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.locks.Lock;


/**
 * @author llach
 */
public class RosMoveBaseNavigationActuator extends RosNode implements NavigationActuator {

    class DriveDirectThread implements Future<CommandResult>, MessageListener<Pose> {

        private Lock poseLock = new NonReentrantLock();
        private Pose lastPose = null;
        private Thread driver;
        private Runnable task;
        private geometry_msgs.Twist driveMsg;
        private geometry_msgs.Twist turnMsg;
        private geometry_msgs.Twist zeroMsg;
        private long driveDuration;
        private long turnDuration;
        private long republishdelay = 20; //ms
        private Pose3D targetPose = null;

        public DriveDirectThread() throws RosSerializer.SerializationException {
            Twist3D zeroTwist = new Twist3D(new Velocity3D(), new AngularVelocity3D());
            zeroMsg = MsgTypeFactory.getInstance().createMsg(zeroTwist, Twist.class);

            task = () -> {
                try {
                    logger.info("starting drive");
                    long timeout = Time.currentTimeMillis() + driveDuration;
                    while (Time.currentTimeMillis() < timeout) {
                        moveRelativePublisher.publish(driveMsg);
                        Thread.sleep(republishdelay);
                    }
                    //todo check target pose
                    timeout = Time.currentTimeMillis() + turnDuration;
                    while (Time.currentTimeMillis() < timeout) {
                        moveRelativePublisher.publish(turnMsg);
                        Thread.sleep(republishdelay);
                    }
                    //todo check target pose
                } catch (InterruptedException e) {
                    return;
                } finally {
                    moveRelativePublisher.publish(zeroMsg);
                }
            };
            driver = new Thread(task);
        }


        public DriveDirectThread drive(@Nullable DriveData drive, @Nullable TurnData turn) throws IOException {

            //Cancel old move
            if (driver.isAlive()) driver.interrupt();
            try {
                driver.join();
            } catch (InterruptedException e) {
            }

            try {
                poseLock.lock();
                if(lastPose != null) targetPose = MsgTypeFactory.getInstance().createType(lastPose,Pose3D.class);
                unpackDrive(drive);
                unpackTurn(turn);
            } catch (RosSerializer.SerializationException | RosSerializer.DeserializationException e) {
                throw new IOException(e);
            } finally {
                poseLock.unlock();
            }

            //Start moving
            driver = new Thread(task);
            driver.run();
            return this;
        }

        private void unpackTurn(TurnData turn) throws RosSerializer.SerializationException {
            if (turn == null) {
                turnDuration = 0;
                turnMsg = zeroMsg;
                return;
            }

            double turnSpeed = turn.getSpeed(RotationalSpeedUnit.RADIANS_PER_SEC);
            double turnAngle = turn.getAngle(AngleUnit.RADIAN);
            if (turnAngle < 0 && turnSpeed > 0) {
                turnSpeed = -turnSpeed;
            }

            //todo 0.5sec for acceleration?
            turnDuration = (long) ((turnAngle / turnSpeed + 0.5) * 1000);

            AngularVelocity3D angVel = new AngularVelocity3D(0.0, 0.0, turnSpeed, RotationalSpeedUnit.RADIANS_PER_SEC);
            Twist3D turnTwist = new Twist3D(new Velocity3D(), angVel);

            //TODO target pose + last + turn

            turnMsg = MsgTypeFactory.getInstance().createMsg(turnTwist, Twist.class);

        }

        private void unpackDrive(DriveData drive) throws RosSerializer.SerializationException {
            if (drive == null) {
                driveDuration = 0;
                driveMsg = zeroMsg;
                return;
            }

            double driveSpeed = drive.getSpeed(SpeedUnit.METER_PER_SEC);
            double dist = drive.getDistance(LengthUnit.METER);
            double distX = drive.getDirection().getX(LengthUnit.METER) / drive.getDirection().getLength(LengthUnit.METER);
            double distY = drive.getDirection().getY(LengthUnit.METER) / drive.getDirection().getLength(LengthUnit.METER);
            double velX = driveSpeed * distX;
            double velY = driveSpeed * distY;
            //todo 0.5sec for acceleration?
            driveDuration = (long) ((dist / driveSpeed + 0.5) * 1000);

            Velocity3D vel = new Velocity3D(velX, velY, 0.0, SpeedUnit.METER_PER_SEC);
            Twist3D driveTwist = new Twist3D(vel, new AngularVelocity3D());

            //TODO target pose + last + drive
            //hint rotate drive
            //CoordinateSystemConverter.
            //

            driveMsg = MsgTypeFactory.getInstance().createMsg(driveTwist, Twist.class);

        }

        @Override
        public boolean cancel(boolean b) {
            driver.interrupt();
            moveRelativePublisher.publish(zeroMsg);
            return false;
        }

        @Override
        public boolean isCancelled() {
            return false;
        }

        @Override
        public boolean isDone() {
            return !driver.isAlive();
        }

        @Override
        public CommandResult get() throws InterruptedException, ExecutionException {
            driver.join();
            return new CommandResult("SUCCESS", CommandResult.Result.SUCCESS, 0);
        }

        @Override
        public CommandResult get(long l, TimeUnit timeUnit) throws InterruptedException, ExecutionException, TimeoutException {
            long timeout = Time.currentTimeMillis() + timeUnit.toMillis(l);
            while (!isDone()) {
                if (Time.currentTimeMillis() > timeout) {
                    throw new TimeoutException();
                }
                Thread.sleep(50);
            }
            return get();
        }

        @Override
        public void onNewMessage(Pose pose) {
            if(poseLock.tryLock()) {
                lastPose = pose;
                poseLock.unlock();
            }


        }
    }

    String topic;

    String moveRelativeTopic;
    Subscriber<Pose> subscriber;
    String poseTopic = "/robot_pose";
    Publisher<geometry_msgs.Twist> moveRelativePublisher;
    DriveDirectThread driveDirect;

    GraphName nodeName;
    ActionClient<MoveBaseActionGoal, MoveBaseActionFeedback, MoveBaseActionResult> ac;

    GoalID lastAcGoalId;

    private org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(getClass());

    public RosMoveBaseNavigationActuator(GraphName gn) {
        initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {
        this.topic = conf.requestValue("topic");
        this.moveRelativeTopic = conf.requestValue("moveRelativeTopic");
        this.poseTopic = conf.requestOptionalValue("pose_topic",poseTopic);
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
        logger.trace("Start " + RosMoveBaseNavigationActuator.class);
        ac = new ActionClient(connectedNode, this.topic, MoveBaseActionGoal._TYPE, MoveBaseActionFeedback._TYPE, MoveBaseActionResult._TYPE);
        moveRelativePublisher = connectedNode.newPublisher(this.moveRelativeTopic, Twist._TYPE);
        subscriber = connectedNode.newSubscriber(poseTopic, geometry_msgs.Pose._TYPE);
        lastAcGoalId = null;

        try {
            driveDirect = new DriveDirectThread();
            subscriber.addMessageListener(driveDirect);
        } catch (RosSerializer.SerializationException e) {
            logger.error(e);
            throw new InitializationException(e);
        }


        if (ac.waitForActionServerToStart(new Duration(20))) {
            initialized = true;
            logger.debug("RosMoveBase NavAct started");
        } else {
            logger.debug("RosMoveBase NavAct timeout after 20sec " + this.topic);
        }

    }

    @Override
    public void destroyNode() {
        if (driveDirect != null) driveDirect.cancel(false);
        if (moveRelativePublisher != null) moveRelativePublisher.shutdown();
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
            goal.setFrameId(PositionData.ReferenceFrame.LOCAL);
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
    public Future<CommandResult> moveRelative(@Nullable DriveData drive, @Nullable TurnData turn) throws IOException {
        return driveDirect.drive(drive,turn);
    }


    @Override
    public Future<CommandResult> navigateToCoordinate(@Nonnull NavigationGoalData data) {
        MoveBaseActionGoal msg = ac.newGoalMessage();

        MoveBaseGoal goal = msg.getGoal();
        try {
            final Pose pose = MsgTypeFactory.getInstance().createMsg(data, Pose.class);
            goal.getTargetPose().setPose(pose);
            goal.getTargetPose().getHeader().setFrameId(data.getFrameId());
        } catch (RosSerializer.SerializationException | NullPointerException e) {
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

        return new NavigationFuture(fut);
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
        return;
    }

}
