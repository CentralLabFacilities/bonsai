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
import de.unibi.citec.clf.bonsai.actuators.StartStopActuator
import de.unibi.citec.clf.bonsai.ros.helper.ResponseFuture
import org.ros.exception.RosException
import org.ros.node.service.ServiceClient
import std_srvs.SetBool
import std_srvs.SetBoolRequest
import std_srvs.SetBoolResponse
import trajectory_msgs.JointTrajectoryPoint

/**
 *
 * @author lruegeme
 */
class BoolStartStop(private val nodeName: GraphName) : RosNode(), StartStopActuator {

    private var client: ServiceClient<SetBoolRequest, SetBoolResponse>? = null
    private val logger = org.apache.log4j.Logger.getLogger(javaClass)
    private var topic = ""

    init {
        initialized = false
    }

    override fun onStart(connectedNode: ConnectedNode) {
        client = connectedNode.newServiceClient(topic, SetBool._TYPE)
        initialized = true
    }

    override fun destroyNode() {
       client?.shutdown()
    }

    override fun getDefaultNodeName(): GraphName {
        return nodeName
    }

    @Throws(ConfigurationException::class)
    override fun configure(ioc: IObjectConfigurator) {
        topic = ioc.requestValue("topic")
    }

    override fun startProcessing() {
        client?.let {
            val req = it.newMessage()
            req.data = true
            val res = ResponseFuture<SetBoolResponse>()
            it.call(req, res)
            res.get()
        }
        throw RosException("service server failure ${this.topic}")
    }

    override fun stopProcessing() {
        client?.let {
            val req = it.newMessage()
            req.data = false
            val res = ResponseFuture<SetBoolResponse>()
            it.call(req, res)
            res.get()
        }
        throw RosException("service server failure ${this.topic}")
    }

}
