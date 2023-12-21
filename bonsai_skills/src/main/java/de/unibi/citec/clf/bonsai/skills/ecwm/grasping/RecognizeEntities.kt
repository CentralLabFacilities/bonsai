package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.ecwm.EntityList
import java.util.concurrent.Future

/**
 * Detects objects in view and uses segmentation to return only those that are inside an entities' storage.
 * <pre>
 *
 * Options:
 *  store:              [String] Optional (default: true)
 *                              -> will add detected objects to the world model
 *  clear:              [String] Optional (default: true)
 *                              -> will clear objects from the world if they aren't present at their supposed location
 *  minProb             [String] Optional (default: 0.5)
 *                              -> the minimal probability for an object to be recognized as such
 *  entityName:         [double] Optional
 *                              -> the entity the storage belongs to
 *  storageName:        [double] Optional
 *                              -> the storage in which the detected objects have to be present
 *  fastPose:           [Boolean] Optional (default: false)
 *                              -> do fast but unprecise pose estimate (bad for grasping)
 *
 * Slots:
 *  Entity: [Entity] [Read]
 *      -> the entity the storage belongs to. Will only be used if option "entityName" is not set.
 *  Storage: [String] [Read]
 *      -> the storage in which the detected objects have to be present. Will only be used if option "storageName" is not set.
 *  RecognizedEntities: [EntityList] [Write]
 *      -> a list of objects detected inside the storage.
 *
 * ExitTokens:
 * success:                Detected one or more objects inside the target storage
 * error:                  No objects could be found
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGraspingActuator]
 *
 * </pre>
 *
 * @author lruegeme
 */

class RecognizeEntities : AbstractSkill() {

    private val KEY_STORE = "#_store"
    private val KEY_CLEAR = "#_clear"
    private val KEY_ENTITY = "#_entity"
    private val KEY_STORAGE = "#_storage"
    private val KEY_PROBABILITY = "#_min_prob"
    private val KEY_FAST = "#_fast_pose"

    //defaults
    private var fast = false
    private var clear = true
    private var store = true
    private var entityName: String? = null
    private var storageName: String? = null
    private var minProb = 0.5

    private var fur: Future<EntityList?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenSuccessError: ExitToken? = null

    private var slotIn: MemorySlotReader<Entity?>? = null
    private var slotIn2: MemorySlotReader<String?>? = null
    private var slotOut: MemorySlotWriter<EntityList>? = null


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessError = configurator.requestExitToken(ExitStatus.ERROR())

        store = configurator.requestOptionalBool(KEY_STORE, store)
        clear = configurator.requestOptionalBool(KEY_CLEAR, clear)
        minProb = configurator.requestOptionalDouble(KEY_PROBABILITY, minProb)
        fast = configurator.requestOptionalBool(KEY_FAST, fast)

        entityName = configurator.requestOptionalValue(KEY_ENTITY, entityName)
        if (entityName == null || entityName == "null") slotIn = configurator.getReadSlot("Entity", Entity::class.java)

        storageName = configurator.requestOptionalValue(KEY_STORAGE, storageName)
        if (storageName == null || storageName == "null") slotIn2 =
            configurator.getReadSlot("Storage", String::class.java)

        slotOut = configurator.getWriteSlot("RecognizedEntities", EntityList::class.java)

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)
    }

    override fun init(): Boolean {
        val entity = slotIn?.let {
            it.recall<Entity>()
        } ?: entityName?.let {
            Entity(it)
        } ?: return false

        val storage = slotIn2?.let {
            it.recall<String>()
        } ?: storageName?.let {
            it
        } ?: return false

        logger.info("recognize objects from: '" + entity.name + "' inside '" + storage + "'")
        fur = ecwm?.recognizeObjects(
            entity = entity,
            storage = storage,
            minProb = minProb,
            fastPose = fast,
            addEntities = store,
            clearStorage = clear
        )
        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        var ents: EntityList? = null
        try {
            ents = fur?.get()
        } catch (e: Exception) {
            logger.error(e)
        }

        if (ents != null) {
            logger.debug("Recognize returned ${ents.size} entities")
            for (e in ents) {
                logger.debug("  - $e")
            }
            slotOut?.memorize(ents)
        }

        return if (ents == null) tokenSuccessError!! else tokenSuccess!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
