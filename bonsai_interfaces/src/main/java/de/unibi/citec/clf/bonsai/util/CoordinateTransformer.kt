package de.unibi.citec.clf.bonsai.util


import de.unibi.citec.clf.bonsai.core.`object`.TransformLookup
import de.unibi.citec.clf.bonsai.core.exception.TransformException
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.btl.data.common.Timestamp
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.geometry.Rotation3D
import de.unibi.citec.clf.btl.data.navigation.PositionData
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import de.unibi.citec.clf.btl.units.TimeUnit
import javax.vecmath.Matrix3d
import javax.vecmath.Vector3d
import javax.vecmath.Vector4d

abstract class CoordinateTransformer : TransformLookup {

    @Throws(TransformException::class)
    @JvmOverloads
    fun transform(data: Point3D, csTo: String, timestamp: Long? = null): Point3D {
        val m = LengthUnit.METER
        val time = timestamp ?: data.timestamp?.created?.time ?: (Time.currentTimeMillis() - 300)
        val t = lookup(data.frameId, csTo, time).transform

        val vec = Vector4d(data.getX(m), data.getY(m), data.getZ(m), 1.0)
        t.transform(vec)

        val newData = Point3D(data)
        newData.setX(vec.x, m)
        newData.setY(vec.y, m)
        newData.setZ(vec.z, m)
        newData.frameId = csTo
        newData.timestamp = Timestamp(time, TimeUnit.MILLISECONDS)
        return newData
    }

    @Throws(TransformException::class)
    @JvmOverloads
    fun transform(data: Rotation3D, csTo: String, timestamp: Long? = null): Rotation3D {
        val time = timestamp ?: data.timestamp?.created?.time ?: (Time.currentTimeMillis() - 300)
        val t = lookup(data.frameId, csTo, time).transform

        val transformRot = Matrix3d()
        t.get(transformRot)

        val resultRot = Matrix3d()
        // From Java3D documentation:
        // mul(): Sets the value of this matrix to the result of multiplying the two argument matrices together.
        resultRot.mul(transformRot, data.matrix)

        val newRotation = Rotation3D(resultRot)
        newRotation.frameId = csTo
        newRotation.timestamp = Timestamp(time, TimeUnit.MILLISECONDS)
        return newRotation
    }

    @Throws(TransformException::class)
    @JvmOverloads
    fun transform(data: Pose3D, csTo: String, timestamp: Long? = null): Pose3D {

        val time = timestamp ?: data.timestamp?.created?.time ?: (Time.currentTimeMillis() - 300)

        // make sure frames are consistent
        data.translation.frameId = data.frameId
        data.rotation.frameId = data.frameId

        val t = transform(data.translation, csTo, time)
        val r = transform(data.rotation, csTo, time)

        val pose = Pose3D(data)
        pose.translation = t
        pose.rotation = r
        pose.frameId = csTo

        pose.timestamp = Timestamp(time, TimeUnit.MILLISECONDS)

        return pose
    }

    @Throws(TransformException::class)
    @JvmOverloads
    fun transform(data: PositionData, csTo: String, timestamp: Long? = null): Pose3D {

        val time = timestamp ?: data.timestamp?.created?.time ?: (Time.currentTimeMillis() - 300)

        val m = LengthUnit.METER
        val x = data.getX(m)
        val y = data.getY(m)
        val yaw = data.getYaw(AngleUnit.RADIAN)
        val csFrom = data.frameId

        val t = transform(Point3D(x, y, 0.0, m, csFrom), csTo, time)
        val r = transform(Rotation3D(Vector3d(0.0, 0.0, 1.0), yaw, AngleUnit.RADIAN, csFrom), csTo, time)

        val position = Pose3D(t, r)
        position.frameId = csTo
        position.generator = data.generator
        position.memoryId = data.memoryId
        position.timestamp = Timestamp(time, TimeUnit.MILLISECONDS)
        return position
    }
}
