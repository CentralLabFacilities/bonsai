package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.person.PersonDataList
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

interface DetectPeopleActuator: Actuator {
    /**
     * Detects all people currently visible.
     */
    @Throws(InterruptedException::class, ExecutionException::class)
    fun getPeople() : Future<PersonDataList>
}