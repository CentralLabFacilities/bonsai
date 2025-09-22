package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import java.io.IOException
import java.util.concurrent.Future

interface ECWMMarker : Actuator {

    @Throws(IOException::class)
    fun findMarker(id: UInt, align: Boolean, max_age: Double): Future<Boolean?>

}