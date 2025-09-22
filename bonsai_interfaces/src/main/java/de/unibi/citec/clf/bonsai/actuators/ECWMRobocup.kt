package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.ecwm.robocup.EntityStorage
import de.unibi.citec.clf.btl.data.ecwm.robocup.EntityWithAttributes
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributes
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributesList
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import de.unibi.citec.clf.btl.data.world.ModelList
import java.io.IOException
import java.util.concurrent.Future

interface ECWMRobocup : Actuator {

    /**
     * Get Attributes for the given entity type
     */
    @Throws(IOException::class)
    fun getModelAttributes(type: String): Future<Map<String, List<String>>?>

    fun getModelAttributes(entity: Entity): Future<Map<String, List<String>>?> {
        return getModelAttributes(entity.modelName)
    }

    @Throws(IOException::class)
    fun getModelAttributes(type: ModelWithAttributes): Future<ModelWithAttributes?>

    @Throws(IOException::class)
    fun getEntityAttributes(entity: Entity): Future<EntityWithAttributes?>

    /**
     * Get All Known Models With Attributes
     */
    @Throws(IOException::class)
    fun getAllModels(): Future<ModelWithAttributesList?>

    /**
     * Returns a list of types that satisfy the given attributes
     */
    @Throws(IOException::class)
    fun getTypesWithAttributes(attributes: Map<String,String>): Future<ModelList?>

    /**
     * Returns a list of entity ids that satisfy the given attributes
     */
    @Throws(IOException::class)
    fun getEntitiesWithAttributes(attributes: Map<String,String>): Future<EntityList?>

    /**
     * Return the Entity (and storage if known)
     */
    @Throws(IOException::class)
    fun getCategoryStorage(category: String): Future<EntityStorage?>

    @Throws(IOException::class)
    fun getEntitySpirits(entity: Entity): Future<Map<String, Set<String>>?>

}
