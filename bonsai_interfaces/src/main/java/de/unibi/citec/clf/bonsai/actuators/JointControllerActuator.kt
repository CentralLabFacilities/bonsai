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

    @Throws(IOException::class)
    fun moveTo(pose: Float, speed: Float?): Future<Boolean>

    fun getMax(): Float
    fun getMin(): Float
    fun getPosition(): Float

}
