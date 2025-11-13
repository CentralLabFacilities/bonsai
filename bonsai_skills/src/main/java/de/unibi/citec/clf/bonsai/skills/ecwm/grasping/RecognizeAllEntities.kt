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
 * Options:
 *  #_store:              [String] Optional (default: false)
 *                              -> will add detected objects to the world model
 *  #_min_prob            [String] Optional (default: 0.5)
 *                              -> the minimal probability for an object to be recognized as such
 *  #_fast_pose:          [Boolean] Optional (default: false)
 *                              -> do fast but unprecise pose estimate (bad for grasping)
 *  #_safety_height       [Double] Optional (default: 0.0)
 *                              -> may move some recognized objects above the given height to avoid them being stuck
 *  #_height_from_slot    [Boolean] Optional (default: false)
 *                              -> use slot for #_safety_height
 *
 * Slots:
 *  RecognizedEntities: [EntityList] (Write)
 *      -> a list of objects detected inside the storage.
 *  SafetyHeight:       [Double] (Read Optional)
 *      -> #_safety_height parameter.
 *          Will only be used if option "#_height_from_slot" is not set.
 *
 * ExitTokens:
 * success:                Detected one or more objects inside the target storage
 * success.none            No objects could be found
 * error:                  No objects could be found
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
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessNone = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("none"))
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        store = configurator.requestOptionalBool(KEY_STORE, store)
        minProb = configurator.requestOptionalDouble(KEY_PROBABILITY, minProb)
        fast = configurator.requestOptionalBool(KEY_FAST, fast)
        safetyHeight = configurator.requestOptionalDouble(KEY_SAFETY_HEIGHT, safetyHeight)

        slotOut = configurator.getWriteSlot("RecognizedEntities", EntityList::class.java)

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)
        useHeightSlot = configurator.requestOptionalBool(KEY_SAFETY_SLOT, useHeightSlot)
        if (useHeightSlot) {
            slotIn = configurator.getReadSlot("SafetyHeight", Float::class.java)
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
