package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import java.util.concurrent.Future

/**
 * Detects objects view and uses segmentation to return only those that are inside an entities' storage.
 *
 * <pre>
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
    private val KEY_USE_SPIRIT = "#_spirit"
    private val KEY_PADDING = "#_padding"
    private val KEY_ADD_PLANE = "#_add_plane"

    //defaults
    private var addPlane = false
    private var padding = 0.05f
    private var fast = false
    private var clear = true
    private var store = true
    private var entityName: String = ""
    private var storageName: String = ""
    private var minProb = 0.5
    private var useSpirit = false

    private var fur: Future<EntityList?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccessNone: ExitToken? = null
    private var tokenSuccessSome: ExitToken? = null

    private var slotIn: MemorySlotReader<Entity?>? = null
    private var slotIn2: MemorySlotReader<String?>? = null
    private var slotOut: MemorySlotWriter<EntityList>? = null
    private var slotSpirit: MemorySlotReader<Spirit>? = null


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessSome = configurator.requestExitToken(
            ExitStatus.SUCCESS().ps("some"),
            "Detected one or more objects inside the target storage"
        )
        tokenSuccessNone = configurator.requestExitToken(
            ExitStatus.SUCCESS().ps("none")
        )

        addPlane = configurator.requestOptionalBool(
            KEY_ADD_PLANE,
            addPlane
        )
        padding = configurator.requestOptionalDouble(
            KEY_PADDING,
            padding.toDouble(),
            "Padding around storage (x/y)"
        ).toFloat()
        store = configurator.requestOptionalBool(
            KEY_STORE,
            store,
            "will add detected objects to the world model"
        )
        clear = configurator.requestOptionalBool(
            KEY_CLEAR,
            clear,
            "will clear objects from the world if they aren't present at their supposed location"
        )
        minProb = configurator.requestOptionalDouble(
            KEY_PROBABILITY,
            minProb,
            "the minimal probability for an object to be recognized as such"
        )
        fast = configurator.requestOptionalBool(
            KEY_FAST,
            fast,
            "do fast but unprecise pose estimate (bad for grasping)"
        )

        useSpirit = configurator.requestOptionalBool(
            KEY_USE_SPIRIT,
            useSpirit,
            "use Spirit instead of entity/storage"
        )
        if (useSpirit) {
            slotSpirit = configurator.getReadSlot(
                "Spirit",
                Spirit::class.java,
                "Entity + Storage, only used if #_spirit is True"
            )
        } else {
            entityName = configurator.requestOptionalValue(
                KEY_ENTITY,
                entityName,
                "the entity the storage belongs to"
            )
            if (!configurator.hasConfigurationKey(KEY_ENTITY)) {
                slotIn = configurator.getReadSlot(
                    "Entity",
                    Entity::class.java,
                    "the entity the storage belongs to.\nWill only be used if option \"#_entity\" or #_spirit is not set."
                )
            }

            storageName = configurator.requestOptionalValue(
                KEY_STORAGE,
                storageName,
                "the storage in which the detected objects have to be present"
            )
            if (!configurator.hasConfigurationKey(KEY_STORAGE)) {
                slotIn2 = configurator.getReadSlot(
                    "Storage",
                    String::class.java,
                    "the storage in which the detected objects have to be present.\nWill only be used if option \"#_storage\" or #_spirit is not set."
                )
            }
        }

        slotOut = configurator.getWriteSlot(
            "RecognizedEntities",
            EntityList::class.java,
            "a list of objects detected inside the storage."
        )

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)
    }

    override fun init(): Boolean {
        var entity : Entity? = null
        var storage : String? = null
        if(useSpirit) {
            val spirit = slotSpirit?.recall<Spirit>() ?: return false
            entity = spirit.entity
            storage = spirit.storage
        } else {
            entity = slotIn?.recall<Entity>() ?: entityName?.let {
                Entity(it)
            } ?: return false
            storage = slotIn2?.recall<String>() ?: storageName ?: return false
        }

        logger.info("recognize objects from: '" + entity.id + "' inside '" + storage + "'")
        fur = ecwm?.recognizeObjects(
            entity = entity,
            storage = storage,
            minProb = minProb,
            fastPose = fast,
            addEntities = store,
            clearStorage = clear,
            padding = padding,
            addPlane = addPlane
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
            logger.fatal(e)
        }

        if (ents != null) {
            logger.debug("Recognize returned ${ents.size} entities")
            for (e in ents) {
                logger.debug("  - $e")
            }
            slotOut?.memorize(ents)
        }

        return if (ents?.isNotEmpty() == true) tokenSuccessSome!! else tokenSuccessNone!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
