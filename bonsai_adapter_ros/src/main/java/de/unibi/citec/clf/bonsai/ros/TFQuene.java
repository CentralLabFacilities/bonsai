/*
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

package de.unibi.citec.clf.bonsai.ros;

import com.google.common.base.Preconditions;
import com.google.common.collect.Maps;

import geometry_msgs.TransformStamped;
import org.apache.log4j.Logger;
import org.ros.concurrent.CircularBlockingDeque;
import org.ros.message.Time;
import org.ros.namespace.GraphName;
import org.ros.rosjava_geometry.LazyFrameTransform;
import org.ros.rosjava_geometry.FrameTransform;
import org.ros.rosjava_geometry.Transform;

import java.util.Map;

/**
 * A tree of {@link TFQuene}s.
 * <p>
 * {@link TFQuene} does not currently support time travel. Lookups
 * always use the newest {@link TransformStamped}.
 *
 * @author damonkohler@google.com (Damon Kohler)
 * @author moesenle@google.com (Lorenz Moesenlechner)
 */
public class TFQuene {

    protected Logger logger = Logger.getLogger(this.getClass());

    private static final int TRANSFORM_QUEUE_CAPACITY = 16;
    private int capacity = TRANSFORM_QUEUE_CAPACITY ;

    private final Object mutex;

    /**
     * A {@link Map} of the most recent {@link LazyFrameTransform} by source
     * frame. Lookups by target frame or by the pair of source and target are both
     * unnecessary because every frame can only have exactly one target.
     */
    private final Map<GraphName, CircularBlockingDeque<LazyFrameTransform>> transforms;

    public TFQuene() {
        mutex = new Object();
        transforms = Maps.newConcurrentMap();
        capacity = TRANSFORM_QUEUE_CAPACITY;
    }

    public TFQuene(int queneCapacity) {
        mutex = new Object();
        transforms = Maps.newConcurrentMap();
        capacity = queneCapacity;
    }

    /**
     * Updates the tree with the provided {@link geometry_msgs.TransformStamped}
     * message.
     * <p>
     * Note that the tree is updated lazily. Modifications to the provided
     * {@link geometry_msgs.TransformStamped} message may cause unpredictable
     * results.
     *
     * @param transformStamped
     *          the {@link geometry_msgs.TransformStamped} message to update with
     */
    public void update(geometry_msgs.TransformStamped transformStamped) {
        Preconditions.checkNotNull(transformStamped);
        GraphName source = GraphName.of(transformStamped.getChildFrameId());
        LazyFrameTransform lazyFrameTransform = new LazyFrameTransform(transformStamped);
        add(source, lazyFrameTransform);
    }

    private void add(GraphName source, LazyFrameTransform lazyFrameTransform) {
        // This adds support for tf2 while maintaining backward compatibility with tf.
        GraphName relativeSource = source.toRelative();
        if (!transforms.containsKey(relativeSource)) {
            transforms.put(relativeSource, new CircularBlockingDeque<LazyFrameTransform>(
                    capacity));
        }
        synchronized (mutex) {
            transforms.get(relativeSource).addFirst(lazyFrameTransform);
        }
    }

    /**
     * Returns the most recent {@link FrameTransform} for target {@code source}.
     *
     * @param source
     *          the frame to look up
     * @return the most recent {@link FrameTransform} for {@code source} or
     *         {@code null} if no transform for {@code source} is available
     */
    public FrameTransform lookUp(GraphName source) {
        Preconditions.checkNotNull(source);
        // This adds support for tf2 while maintaining backward compatibility with tf.
        return getLatest(source.toRelative());
    }

    private FrameTransform getLatest(GraphName source) {
        CircularBlockingDeque<LazyFrameTransform> deque = transforms.get(source);
        if (deque == null) {
            return null;
        }
        LazyFrameTransform lazyFrameTransform = deque.peekFirst();
        if (lazyFrameTransform == null) {
            return null;
        }
        return lazyFrameTransform.get();
    }

    /**
     * @see #lookUp(GraphName)
     */
    public FrameTransform get(String source) {
        Preconditions.checkNotNull(source);
        return lookUp(GraphName.of(source));
    }

    /**
     * Returns the {@link FrameTransform} for {@code source} closest to
     * {@code time}.
     *
     * @param source
     *          the frame to look up
     * @param time
     *          the transform for {@code frame} closest to this {@link Time} will
     *          be returned
     * @return the most recent {@link FrameTransform} for {@code source} or
     *         {@code null} if no transform for {@code source} is available
     */
    public FrameTransform lookUp(GraphName source, Time time) {
        Preconditions.checkNotNull(source);
        Preconditions.checkNotNull(time);
        return get(source, time);
    }

    // TODO(damonkohler): Use an efficient search.
    private FrameTransform get(GraphName source, Time time) {
        CircularBlockingDeque<LazyFrameTransform> deque = transforms.get(source);
        if (deque == null) {
            return null;
        }
        LazyFrameTransform result = null;
        synchronized (mutex) {
            long offset = 0;
            for (LazyFrameTransform lazyFrameTransform : deque) {
                if (result == null) {
                    result = lazyFrameTransform;
                    offset = Math.abs(time.subtract(result.get().getTime()).totalNsecs());
                    continue;
                }
                long newOffset = Math.abs(time.subtract(lazyFrameTransform.get().getTime()).totalNsecs());
                if (newOffset < offset) {
                    result = lazyFrameTransform;
                    offset = newOffset;
                }
            }
        }
        if (result == null) {
            return null;
        }
        return result.get();
    }

    /**
     * @see #lookUp(GraphName, Time)
     */
    public FrameTransform get(String source, Time time) {
        Preconditions.checkNotNull(source);
        return lookUp(GraphName.of(source), time);
    }

    /**
     * @return the {@link FrameTransform} from source the frame to the target
     *         frame, or {@code null} if no {@link FrameTransform} could be found
     */
    public FrameTransform transform(GraphName source, GraphName target) {
        Preconditions.checkNotNull(source);
        Preconditions.checkNotNull(target);
        // This adds support for tf2 while maintaining backward compatibility with tf.
        GraphName relativeSource = source.toRelative();
        GraphName relativeTarget = target.toRelative();
        if (relativeSource.equals(relativeTarget)) {
            return new FrameTransform(Transform.identity(), relativeSource, relativeTarget, null);
        }
        FrameTransform sourceToRoot = transformToRoot(relativeSource);
        FrameTransform targetToRoot = transformToRoot(relativeTarget);
        if (sourceToRoot == null && targetToRoot == null) {
            logger.error("error1");
            return null;
        }
        if (sourceToRoot == null) {
            if (targetToRoot.getTargetFrame().equals(relativeSource)) {
                // relativeSource is root.
                return targetToRoot.invert();
            } else {
                logger.error("error2");
                return null;
            }
        }
        if (targetToRoot == null) {
            if (sourceToRoot.getTargetFrame().equals(relativeTarget)) {
                // relativeTarget is root.
                return sourceToRoot;
            } else {
                logger.error("error3");
                return null;
            }
        }
        if (sourceToRoot.getTargetFrame().equals(targetToRoot.getTargetFrame())) {
            // Neither relativeSource nor relativeTarget is root and both share the
            // same root.
            Transform transform =
                    targetToRoot.getTransform().invert().multiply(sourceToRoot.getTransform());
            return new FrameTransform(transform, relativeSource, relativeTarget, sourceToRoot.getTime());
        }
        // No known transform.
        logger.error("error4");
        return null;

    }

    /**
     * @see #transform(GraphName, GraphName)
     */
    public FrameTransform transform(String source, String target) {
        Preconditions.checkNotNull(source);
        Preconditions.checkNotNull(target);
        return transform(GraphName.of(source), GraphName.of(target));
    }

    FrameTransform transformToRoot(GraphName source) {
        FrameTransform result = getLatest(source);
        if (result == null) {
            return null;
        }
        while (true) {
            FrameTransform resultToParent = lookUp(result.getTargetFrame(), result.getTime());
            if (resultToParent == null) {
                return result;
            }
            // Now resultToParent.getSourceFrame() == result.getTargetFrame()
            Transform transform = resultToParent.getTransform().multiply(result.getTransform());
            GraphName target = resultToParent.getTargetFrame();
            result = new FrameTransform(transform, source, target, result.getTime());
        }
    }
}
