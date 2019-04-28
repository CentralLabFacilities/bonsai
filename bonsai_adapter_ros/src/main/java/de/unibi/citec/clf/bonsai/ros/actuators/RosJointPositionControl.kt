package de.unibi.citec.clf.bonsai.ros.actuators

import actionlib_msgs.GoalID
import com.github.rosjava_actionlib.ActionClient
import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.ros.RosNode
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.ros.MsgTypeFactory
import org.ros.message.Duration
import org.ros.namespace.GraphName
import org.ros.node.ConnectedNode
import java.io.IOException
import java.util.concurrent.Future

import control_msgs.FollowJointTrajectoryAction
import control_msgs.FollowJointTrajectoryActionFeedback
import control_msgs.FollowJointTrajectoryActionGoal
import control_msgs.FollowJointTrajectoryActionResult
import trajectory_msgs.JointTrajectoryPoint
import kotlin.math.abs

/**
 *
 * @author lruegeme
 */
class RosJointPositionControl(private val nodeName: GraphName) : RosNode(), JointControllerActuator {


    private var ac: ActionClient<FollowJointTrajectoryActionGoal, FollowJointTrajectoryActionFeedback, FollowJointTrajectoryActionResult>? = null
    private lateinit var control_topic: String
    private lateinit var joint: String
    private val logger = org.apache.log4j.Logger.getLogger(javaClass)

    init {
        initialized = false
    }

    override fun onStart(connectedNode: ConnectedNode) {
        ac = ActionClient(
                connectedNode,
                this.control_topic,
                FollowJointTrajectoryActionGoal._TYPE,
                FollowJointTrajectoryActionFeedback._TYPE,
                FollowJointTrajectoryActionResult._TYPE
        )


        if (ac?.waitForActionServerToStart(Duration(2.0)) == true) {
            logger.info("RosJointController connected to $control_topic")
            initialized = true
        } else {
            logger.warn("RosJointController not started to $control_topic")
        }

    }

    override fun destroyNode() {
        ac?.finish()
    }

    override fun getDefaultNodeName(): GraphName {
        return nodeName
    }

    @Throws(ConfigurationException::class)
    override fun configure(ioc: IObjectConfigurator) {
        this.control_topic = ioc.requestValue("topic")
        this.joint = ioc.requestValue("joint")
    }


    @Throws(IOException::class)
    override fun moveTo(pose: Float, speed: Float?): Future<Boolean> {
        //TODO clamp to min/max


        ac?.let { client ->
            val goal = client.newGoalMessage()

            var traj = MsgTypeFactory.getInstance().newMessage<JointTrajectoryPoint>(JointTrajectoryPoint._TYPE)
            traj.positions = doubleArrayOf(pose.toDouble())

            //val delta = abs(getPosition() - pose)
            //val duration_sec = delta / (speed?:1f)
            val duration_sec = 1f / (speed?:0.25f)

            traj.timeFromStart = Duration.fromMillis((duration_sec * 1000).toLong())

            goal.goal.trajectory.jointNames.add(joint)
            goal.goal.trajectory.points.add(traj)

            goal.goal.goalTimeTolerance = Duration.fromMillis(1000)


            val sendGoal = client.sendGoal(goal)

            logger.info("Ros Joint Position Control: $goal")

            return sendGoal.toBooleanFuture()
        }

        throw IOException()
    }

    override fun getMax(): Float {
        throw NotImplementedError()
    }

    override fun getMin(): Float {
        throw NotImplementedError()
    }

    override fun getPosition(): Float {
        //TODO
        //return 0.0f
        throw NotImplementedError()
    }

}
