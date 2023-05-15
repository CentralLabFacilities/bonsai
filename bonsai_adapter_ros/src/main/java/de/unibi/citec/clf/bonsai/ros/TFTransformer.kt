package de.unibi.citec.clf.bonsai.ros

import de.unibi.citec.clf.bonsai.core.exception.TransformException
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.Transform
import org.apache.log4j.Logger
import org.ros.message.MessageListener
import org.ros.namespace.GraphName
import org.ros.node.ConnectedNode
import org.ros.node.topic.Subscriber
import org.ros.rosjava_geometry.FrameTransform
import org.ros.rosjava_geometry.FrameTransformTree
import tf2_msgs.TFMessage
import javax.media.j3d.Transform3D
import javax.vecmath.Quat4d
import javax.vecmath.Vector3d

/**
 * Created by lruegeme on 1/18/18.
 */
class TFTransformer(gn: GraphName) : CoordinateTransformer() {
    private val logger = Logger.getLogger(javaClass)

    //gosch
    private inner class TfNode(gn: GraphName) : RosNode(), MessageListener<TFMessage> {
        private val nodeName: GraphName
        private val currentTree: FrameTransformTree
        private var subscriberTf: Subscriber<TFMessage>? = null
        private var subscriberTfStatic: Subscriber<TFMessage>? = null
        override fun onStart(connectedNode: ConnectedNode) {
            subscriberTf = connectedNode.newSubscriber("/tf", TFMessage._TYPE)
            subscriberTfStatic = connectedNode.newSubscriber("/tf_static", TFMessage._TYPE)
            subscriberTf?.addMessageListener(this, 10)
            subscriberTfStatic?.addMessageListener(this, 1)
            initialized = true
        }

        override fun destroyNode() {
            subscriberTf?.shutdown()
            subscriberTfStatic?.shutdown()
        }

        override fun getDefaultNodeName(): GraphName {
            return nodeName
        }

        @Throws(TransformException::class)
        fun getTransform(source: String?, target: String?): FrameTransform {
            val transform = currentTree.transform(source, target)
            logger.trace("fetch tf: $transform")
            return transform ?: throw TransformException(source, target, Time.currentTimeMillis())
        }

        override fun onNewMessage(tfMessage: TFMessage) {
            val transforms = tfMessage.transforms
            for (ts in transforms) {
                logger.trace("got tf " + ts.header.frameId + " -> " + ts.childFrameId)
                currentTree.update(ts)
            }
        }

        init {
            initialized = false
            nodeName = gn
            currentTree = FrameTransformTree()
        }
    }

    private val node: TfNode
    fun getNode(): RosNode {
        return node
    }

    @Throws(TransformException::class)
    override fun lookup(from: String, to: String, time: Long): Transform {
        logger.debug("lookup $from -> $to")
        val ftf = node.getTransform(from, to)
        val translation = ftf.transform.translation
        val rotationAndScale = ftf.transform.rotationAndScale
        val quat = Quat4d(rotationAndScale.x, rotationAndScale.y,
                rotationAndScale.z, rotationAndScale.w)
        val vec = Vector3d(translation.x, translation.y, translation.z)

        //todo check scale
        val tf3d = Transform3D(quat, vec, 1.0)
        return Transform(tf3d, from, to, ftf.time.totalNsecs())
    }

    init {
        node = TfNode(gn)
    }
}