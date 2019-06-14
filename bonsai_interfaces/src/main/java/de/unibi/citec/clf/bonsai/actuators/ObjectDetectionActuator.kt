package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.List
import de.unibi.citec.clf.btl.data.`object`.ObjectShapeData
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D
import java.io.IOException

import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 *
 * @author lruegeme
 */
interface ObjectDetectionActuator : Actuator {
    @Throws(IOException::class)
    fun detectObjects(roi: BoundingBox3D? = null): Future<List<ObjectShapeData>>

    @Throws(IOException::class)
    fun detectSurface() : Future<BoundingBox3D>
}
