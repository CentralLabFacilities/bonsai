package de.unibi.citec.clf.bonsai.ros;

import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.Transform;
import de.unibi.citec.clf.btl.ros.MsgTypeFactory;
import geometry_msgs.TransformStamped;
import org.apache.log4j.Logger;
import org.ros.message.MessageListener;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;
import org.ros.node.topic.Subscriber;
import org.ros.rosjava_geometry.FrameTransform;
import org.ros.rosjava_geometry.FrameTransformTree;
import org.ros.rosjava_geometry.Quaternion;
import org.ros.rosjava_geometry.Vector3;
import tf2_msgs.TFMessage;

import javax.media.j3d.Transform3D;
import javax.vecmath.Quat4d;
import javax.vecmath.Vector3d;
import java.util.List;


/**
 * Created by lruegeme on 1/18/18.
 */
public class TFTransformer extends CoordinateTransformer {

    private Logger logger = Logger.getLogger(getClass());

    //gosch
    private class TfNode extends RosNode implements MessageListener<tf2_msgs.TFMessage> {

        private GraphName nodeName;
        private FrameTransformTree currentTree;

        private Subscriber<tf2_msgs.TFMessage> subscriberTf;
        private Subscriber<tf2_msgs.TFMessage> subscriberTfStatic;

        public TfNode(GraphName gn) {
            this.initialized = false;
            this.nodeName = gn;
            currentTree = new FrameTransformTree();
        }

        @Override
        public void onStart(ConnectedNode connectedNode) {
            subscriberTf = connectedNode.newSubscriber("/tf", TFMessage._TYPE);
            subscriberTfStatic = connectedNode.newSubscriber("/tf_static", TFMessage._TYPE);
            subscriberTf.addMessageListener(this, 500);
            subscriberTfStatic.addMessageListener(this, 1);
            initialized = true;

        }

        @Override
        public void destroyNode() {
            subscriberTf.shutdown();
            subscriberTfStatic.shutdown();
        }

        @Override
        public GraphName getDefaultNodeName() {
            return nodeName;
        }

        public FrameTransform getTransform(String source, String target) throws TransformException {
            FrameTransform transform = currentTree.transform(source, target);

            logger.trace("fetch tf: " + transform);
            if (transform != null && transform.getTime() != null) {
                return transform;
            } else {
                throw new TransformException(source, target, System.currentTimeMillis());
            }
        }

        @Override
        public void onNewMessage(TFMessage tfMessage) {
            List<TransformStamped> transforms = tfMessage.getTransforms();
            for (TransformStamped ts : transforms) {
                currentTree.update(ts);
            }
        }
    }

    private final TfNode node;

    public RosNode getNode() {
        return node;
    }

    public TFTransformer(GraphName gn) {
        node = new TfNode(gn);
    }

    @Override
    public Transform lookup(String from, String to, long time) throws TransformException {
        final FrameTransform ftf = node.getTransform(from, to);

        final Vector3 translation = ftf.getTransform().getTranslation();
        final Quaternion rotationAndScale = ftf.getTransform().getRotationAndScale();

        final Quat4d quat = new Quat4d(rotationAndScale.getX(), rotationAndScale.getY(),
                rotationAndScale.getZ(), rotationAndScale.getW());
        final Vector3d vec = new Vector3d(translation.getX(), translation.getY(), translation.getZ());

        //todo check scale
        final Transform3D tf3d = new Transform3D(quat, vec, 1.0);

        return new Transform(tf3d, from, to, ftf.getTime().totalNsecs());

    }

}
