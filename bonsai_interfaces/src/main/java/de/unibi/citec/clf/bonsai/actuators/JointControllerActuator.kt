package de.unibi.citec.clf.bonsai.actuators


import de.unibi.citec.clf.bonsai.core.`object`.Actuator
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
    fun moveTo(pose: Float, duration: Float?): Future<Boolean>

    fun getMax(): Float
    fun getMin(): Float
    fun getPosition(): Float

}
