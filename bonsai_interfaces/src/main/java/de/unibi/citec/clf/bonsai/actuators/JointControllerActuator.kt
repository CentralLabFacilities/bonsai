package de.unibi.citec.clf.bonsai.actuators


import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.common.Timestamp
import de.unibi.citec.clf.btl.units.TimeUnit
import java.io.IOException
import java.util.concurrent.Future

/**
 * Interface to simple joints
 *
 * @author llach
 */
interface JointControllerActuator : Actuator {

    /**
     * @param duration duration of the move in 1/duration sec
     */

    @Throws(IOException::class)
    fun moveTo(pose: Float, duration: Long, unit: TimeUnit = TimeUnit.MILLISECONDS): Future<Boolean>
    fun moveTo(pose: Float, speed: Double): Future<Boolean>

    fun getMax(): Double?
    fun getMin(): Double?
    fun getPosition(): Double?

}
