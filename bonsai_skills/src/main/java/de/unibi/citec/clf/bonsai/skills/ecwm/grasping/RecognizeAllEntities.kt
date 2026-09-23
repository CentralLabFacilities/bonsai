package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.EntityList
import java.util.concurrent.Future

/**
 * Detects all entities in view.
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

class RecognizeAllEntities : AbstractSkill() {

    private val KEY_STORE = "#_store"
    private val KEY_PROBABILITY = "#_min_prob"
    private val KEY_FAST = "#_fast_pose"
    private val KEY_SAFETY_HEIGHT = "#_safety_height"
    private val KEY_SAFETY_SLOT = "#_height_from_slot"

    //defaults
    private var useHeightSlot = false
    private var safetyHeight = 0.0
    private var fast = false
    private var store = false
    private var minProb = 0.5

    private var fur: Future<EntityList?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenSuccessNone: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var slotOut: MemorySlotWriter<EntityList>? = null
    private var slotIn: MemorySlotReader<Float>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(
            ExitStatus.SUCCESS().withProcessingStatus("some"),
            "Detected one or more objects inside the target storage"
        )
        tokenSuccessNone = configurator.requestExitToken(
            ExitStatus.SUCCESS().withProcessingStatus("none"),
            "No objects could be found"
        )
        tokenError = configurator.requestExitToken(
            ExitStatus.ERROR(),
            "No objects could be found"
        )

        store = configurator.requestOptionalBool(
            KEY_STORE,
            store,
            "will add detected objects to the world model"
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

        safetyHeight = configurator.requestOptionalDouble(
            KEY_SAFETY_HEIGHT,
            safetyHeight,
            "may move some recognized objects above the given height to avoid them being stuck"
        )

        slotOut = configurator.getWriteSlot(
            "RecognizedEntities",
            EntityList::class.java,
            "a list of objects detected inside the storage."
        )

        ecwm = configurator.getActuator(
            "ECWMGrasping",
            ECWMGrasping::class.java
        )

        useHeightSlot = configurator.requestOptionalBool(
            KEY_SAFETY_SLOT,
            useHeightSlot,
            "use slot for #_safety_height"
        )

        if (useHeightSlot) {
            slotIn = configurator.getReadSlot(
                "SafetyHeight",
                Float::class.java,
                "#_safety_height parameter.\n" +
                        " Will only be used if option \"#_height_from_slot\" is not set."
            )
        }
    }

    override fun init(): Boolean {
        safetyHeight = slotIn?.recall<Float>()?.toDouble() ?: safetyHeight

        logger.info("recognize entities: minProb=$minProb, fastPose=$fast, addEntities=$store, safetyHeight=$safetyHeight")
        fur = ecwm?.recognizeEntities(
            minProb = minProb,
            fastPose = fast,
            addEntities = store,
            safetyHeight = safetyHeight
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
            return tokenError!!
        }

        if (ents == null) return tokenError!!

        logger.debug("Recognize returned ${ents.size} entities")
        for (e in ents) {
            logger.debug("  - $e")
        }
        slotOut?.memorize(ents)
        return if (ents.size == 0) tokenSuccessNone!! else tokenSuccess!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
