package de.unibi.citec.clf.bonsai.ros.actuators

import com.github.rosjava_actionlib.ActionClient
import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.ros.RosNode
import de.unibi.citec.clf.btl.ros.MsgTypeFactory
import org.ros.message.Duration
import org.ros.namespace.GraphName
import org.ros.node.ConnectedNode
import java.io.IOException
import java.util.concurrent.Future

import control_msgs.FollowJointTrajectoryActionFeedback
import control_msgs.FollowJointTrajectoryActionGoal
import control_msgs.FollowJointTrajectoryActionResult
import control_msgs.JointTrajectoryControllerState
import de.unibi.citec.clf.bonsai.util.BoundSynchronizedQueue
import de.unibi.citec.clf.btl.units.TimeUnit
import de.unibi.citec.clf.btl.units.UnitConverter
import org.ros.message.MessageListener
import org.ros.node.topic.Subscriber
import trajectory_msgs.JointTrajectoryPoint
import kotlin.math.abs

/**
 *
 * @author lruegeme
 */
class RosJointPositionControl(private val nodeName: GraphName) : RosNode(), JointControllerActuator, MessageListener<JointTrajectoryControllerState> {

    private val queue: BoundSynchronizedQueue<JointTrajectoryControllerState> = BoundSynchronizedQueue(2);
    private var state: Subscriber<JointTrajectoryControllerState>? = null
    private var ac: ActionClient<FollowJointTrajectoryActionGoal, FollowJointTrajectoryActionFeedback, FollowJointTrajectoryActionResult>? = null
    private lateinit var controllerTopic: String
    private lateinit var jointName: String
    private val logger = org.apache.log4j.Logger.getLogger(javaClass)
    private var joint = -1

    init {
        initialized = false
    }

    override fun onStart(connectedNode: ConnectedNode) {
        state = connectedNode.newSubscriber("${this.controllerTopic}/state", JointTrajectoryControllerState._TYPE)
        state?.addMessageListener(this)
        ac = ActionClient(
                connectedNode,
                "$controllerTopic/follow_joint_trajectory",
                FollowJointTrajectoryActionGoal._TYPE,
                FollowJointTrajectoryActionFeedback._TYPE,
                FollowJointTrajectoryActionResult._TYPE
        )


        initialized = true
        //if (ac?.waitForActionServerToStart(Duration(20.0)) == true) {
        //    logger.info("connected to $controllerTopic/follow_joint_trajectory")
        //    initialized = true
        //} else {
        //    logger.error("not started for $controllerTopic")
        //}

    }

    override fun destroyNode() {
        ac?.finish()
    }

    override fun getDefaultNodeName(): GraphName {
        return nodeName
    }

    @Throws(ConfigurationException::class)
    override fun configure(ioc: IObjectConfigurator) {
        this.controllerTopic = ioc.requestValue("controller")
        this.jointName = ioc.requestValue("joint")
    }


    @Throws(IOException::class)
    override fun moveTo(pose: Float, speed: Double): Future<Boolean> {
        ac?.let { client ->
            val goal = client.newGoalMessage()

            val current = getPosition() ?: throw IOException("cant get current joint pose")

            val delta = abs(pose - current)
            val duration = (delta / speed) * 1000

            val traj = MsgTypeFactory.getInstance().newMessage<JointTrajectoryPoint>(JointTrajectoryPoint._TYPE)
            traj.positions = doubleArrayOf(pose.toDouble())

            traj.timeFromStart = Duration.fromMillis(duration.toLong())

            goal.goal.trajectory.jointNames.add(jointName)
            goal.goal.trajectory.points.add(traj)

            goal.goal.goalTimeTolerance = Duration.fromMillis(2000)

            val sendGoal = client.sendGoal(goal)

            logger.info("Ros Joint Position Control: $goal")

            return sendGoal.toBooleanFuture()
        }

        throw IOException()
    }

    override fun moveTo(pose: Float, duration: Long, unit: TimeUnit): Future<Boolean> {
        ac?.let { client ->
            val goal = client.newGoalMessage()

            val traj = MsgTypeFactory.getInstance().newMessage<JointTrajectoryPoint>(JointTrajectoryPoint._TYPE)
            traj.positions = doubleArrayOf(pose.toDouble())
            traj.timeFromStart = Duration.fromMillis(UnitConverter.convert(duration,unit,TimeUnit.MILLISECONDS))

            goal.goal.trajectory.jointNames.add(jointName)
            goal.goal.trajectory.points.add(traj)

            goal.goal.goalTimeTolerance = Duration.fromMillis(2000)

            val sendGoal = client.sendGoal(goal)

            logger.info("Ros Joint Position Control: $goal")

            return sendGoal.toBooleanFuture()
        }

        throw IOException()
    }


    override fun getMax(): Double? {
        throw NotImplementedError()
    }

    override fun getMin(): Double? {
        throw NotImplementedError()
    }

    override fun getPosition(): Double? {
        val current = queue.front()
        return if (joint == -1) null
        else current.actual.positions[joint]
    }

    override fun onNewMessage(p0: JointTrajectoryControllerState?) {
        queue.push(p0)
        if (joint == -1) {
            joint = p0?.jointNames?.indexOf(jointName) ?: -1
            logger.warn("found joint: '$jointName' at position $joint")
        }
    }

}
