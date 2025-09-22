package de.unibi.citec.clf.btl.data.ecwm

import de.unibi.citec.clf.btl.Type
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.geometry.Pose3D

/**
 * A Specific Goal(targetPose) inside a spirit
 */
class SpiritGoal(
    val camHeight: Double,
    val viewTarget: Pose3D,
    val targetPose: Pose2D,
    val goalBlocked: Boolean = false
) : Type() , Cloneable {
        override fun clone(): SpiritGoal {
                return SpiritGoal(camHeight, Pose3D(viewTarget), Pose2D(targetPose), goalBlocked)
        }
        constructor(s: SpiritGoal) : this(s.camHeight, Pose3D(s.viewTarget), Pose2D(s.targetPose), s.goalBlocked)
}

