package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import java.io.IOException
import java.util.concurrent.Future

interface WorldModel : Actuator {

    @Throws(IOException::class)
    fun fetchEntitiesByType(expression : String): Future<EntityList?>

    @Throws(IOException::class)
    fun getEntity(name : String): Future<Entity?>

    @Throws(IOException::class)
    fun moveEntity(enitiy: Entity, pose: Pose3D): Future<Entity?>

    @Throws(IOException::class)
    fun addEntities(entities: List<Entity>): Future<Boolean?>

    @Throws(IOException::class)
    fun removeEntities(entities: List<Entity>): Future<Boolean?>
}