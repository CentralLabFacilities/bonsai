package de.unibi.citec.clf.bonsai.ros2

import de.unibi.citec.clf.bonsai.core.exception.TransformException
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.Transform
import id.jros2client.JRos2Client
import id.jros2messages.geometry_msgs.TransformStampedMessage
import org.apache.log4j.Logger
import pinorobotics.jros2tf2.JRos2Tf2
import pinorobotics.jros2tf2.JRos2Tf2Factory
import pinorobotics.jrostf2.tf2_msgs.TF2ErrorMessage
import javax.media.j3d.Transform3D
import javax.vecmath.Quat4d
import javax.vecmath.Vector3d


/**
 * Created by lruegeme on 1/18/18.
 */
class Tf2Transformer(client: JRos2Client) : CoordinateTransformer() {
    private val node: TfNode
    init {
        node = TfNode(client)
    }

    private val logger = Logger.getLogger(javaClass)

    fun getNode(): Ros2Node {
        return node
    }

    @Throws(TransformException::class)
    override fun lookup(from: String, to: String, time: Long): Transform {
        logger.debug("lookup $from -> $to")
        val ftf = node.getTransform(from, to)

        val translation = ftf.transform.translation
        val rotation = ftf.transform.rotation
        val quat = Quat4d(rotation.x, rotation.y,
                rotation.z, rotation.w)
        val vec = Vector3d(translation.x, translation.y, translation.z)

        //todo check scale
        val tf3d = Transform3D(quat, vec, 1.0)
        return Transform(tf3d, from, to, 0)
    }


    private inner class TfNode(client: JRos2Client) : Ros2Node() {

        private var tf2: JRos2Tf2? = null;

        init {
            initialized = false
            this.client = client;
        }

        @Throws(TransformException::class)
        fun getTransform(source: String?, target: String?): TransformStampedMessage {
            val tf = tf2?.lookupTransform(target,source)
            if (tf?.error?.codeType == TF2ErrorMessage.ErrorType.NO_ERROR) return tf!!.transform
            else throw RuntimeException("error fetching tf: ${tf?.error?.error_string}")
        }

        override fun onStart() {
            tf2 = JRos2Tf2Factory().createTf2Client(client)
        }

        override fun cleanUp() {
            tf2?.close()
            client.close()
        }
    }

}