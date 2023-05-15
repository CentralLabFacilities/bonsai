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
import org.ros.rosjava.tf.pubsub.TransformListener
import org.ros.rosjava_geometry.FrameTransform
import org.ros.rosjava_geometry.FrameTransformTree
import tf2_msgs.TFMessage
import java.lang.RuntimeException
import javax.media.j3d.Transform3D
import javax.vecmath.Quat4d
import javax.vecmath.Vector3d

/**
 * Created by lruegeme on 1/18/18.
 */
class RosjavaTfWrapper(gn: GraphName) : CoordinateTransformer() {
    private val logger = Logger.getLogger(javaClass)

    //gosch
    private inner class TfNode(gn: GraphName) : RosNode() {
        private val nodeName: GraphName

        private var tfl : TransformListener? = null

        override fun onStart(connectedNode: ConnectedNode) {
            tfl = TransformListener(connectedNode);
            initialized = true
        }

        override fun destroyNode() {
            tfl?.deleteObservers()
            tfl = null
        }

        override fun getDefaultNodeName(): GraphName {
            return nodeName
        }

        @Throws(TransformException::class)
        fun getTransform(source: String?, target: String?): org.ros.rosjava.tf.Transform {
            tfl?.tree?.let {
                if (!it.canTransform(source, target)) {
                    throw TransformException(source, target, 0)
                } else {
                    return tfl?.tree?.lookupTransformBetween(source, target, 0)!!
                }
            }
            throw RuntimeException("error fetching tf")
        }


        init {
            initialized = false
            nodeName = gn
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

        val translation = ftf.translation
        val rotation = ftf.rotation
        val quat = Quat4d(rotation.x, rotation.y,
                rotation.z, rotation.w)
        val vec = Vector3d(translation.x, translation.y, translation.z)

        //todo check scale
        val tf3d = Transform3D(quat, vec, 1.0)
        return Transform(tf3d, from, to, 0)
    }

    init {
        node = TfNode(gn)
    }
}