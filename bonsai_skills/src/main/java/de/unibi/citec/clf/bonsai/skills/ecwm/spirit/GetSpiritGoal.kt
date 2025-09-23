package de.unibi.citec.clf.bonsai.skills.ecwm.spirit

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import de.unibi.citec.clf.btl.data.ecwm.SpiritGoal
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.Future
import kotlin.collections.iterator

/**
 * Fetches Navigation and Spirit Goals from an ECWM Entity
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Entity Name to fetch goals from
 *  spirit:     [String] Optional
 *                  -> Name of the spirit
 *  storage     [String] Optional
 *                  -> Which storage the spirit is from (manually defined use key "")
 *  force_move: [Boolean] Optional
 *                  -> Force Movement even if current position is inside the spirit
 *
 *
 * Slots:
 *  Entity:   [de.unibi.citec.clf.btl.data.world.Entity] Optional
 *                  -> Entity to fetch goals from, is used if the 'entity' option is not set
 *  NavigationGoalData [de.unibi.citec.clf.btl.data.navigation.NavigationGoalData]
 *                  -> Slot the NavGoal of the SpiritGoal will be written to
 *  SpiritGoal [de.unibi.citec.clf.btl.data.ecwm.SpiritGoal]
 *                  -> The SpiritGoal fetched from the entity
 *
 * ExitTokens:
 *  success:        Got a Reacheable Goal
 *  error.blocked:  All possible poses are blocked in costmaps,
 *                      goal is using nearest target disregarding costmaps
 *                      try to clear costmaps and try again or use NearestToTarget drive strategy
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMSpiritActuator: [de.unibi.citec.clf.bonsai.actuators.ECWMSpirit]
 *      -> Used to get the current World Model
 *
 * </pre>
 *
 * @author lruegeme, jzilke
 */
class GetSpiritGoal : AbstractSkill() {

    private val KEY_USE_SPIRIT = "use_spirit"
    private var useSpirit = false
    private var spirit: Spirit? = null
    private var spiritSlot: MemorySlotReader<Spirit>? = null

    private val KEY_ENTITY = "entity"
    private val KEY_SPIRIT = "spirit"
    private val KEY_STORAGE = "storage"
    private val KEY_FORCE_MOVE = "force_move"
    private val KEY_ROOM = "consider_room"

    private var fur: Future<ECWMSpirit.SpiritGoalResult?>? = null
    private var ecwm: ECWMSpirit? = null
    private var ecwmRobocup: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null


    private var nav: MemorySlotWriter<NavigationGoalData>? = null
    private var sg: MemorySlotWriter<SpiritGoal>? = null
    private var entity: MemorySlotReader<Entity>? = null
    private var storage: MemorySlotReader<String>? = null

    private var room = true;
    private var forceMove = false;
    private var entityname: String = ""
    private var spiritName: String = "viewpoint"
    private var storageName: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR().ps("blocked"))

        nav = configurator.getWriteSlot("NavigationGoalData", NavigationGoalData::class.java)
        sg = configurator.getWriteSlot("SpiritGoal", SpiritGoal::class.java)

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)
        if(logger.isDebugEnabled) ecwmRobocup = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)

        useSpirit = configurator.requestOptionalBool(KEY_USE_SPIRIT,useSpirit)
        if (useSpirit) {
            spiritSlot = configurator.getReadSlot("SpiritSlot", Spirit::class.java)
        } else {
            if (configurator.hasConfigurationKey(KEY_ENTITY)) {
                entityname = configurator.requestValue(KEY_ENTITY)
            } else {
                entity = configurator.getReadSlot("Entity", Entity::class.java)
            }

            if (configurator.hasConfigurationKey(KEY_STORAGE)) {
                storageName = configurator.requestValue(KEY_STORAGE)
            } else {
                storage = configurator.getReadSlot("Storage", String::class.java)
            }
            spiritName = configurator.requestOptionalValue(KEY_SPIRIT, spiritName)
        }

        forceMove = configurator.requestOptionalBool(KEY_FORCE_MOVE, forceMove)
        room = configurator.requestOptionalBool(KEY_ROOM, room)
    }

    override fun init(): Boolean {
        if (useSpirit) {
            spirit = spiritSlot?.recall<Spirit>() ?: return false
        } else {
            if(entity != null) {
                val e = entity!!.recall<Entity>() ?: return false
                entityname = e.id
            }

            if(storage != null) {
                storageName = storage!!.recall<String>() ?: return false
            }

            spirit = Spirit(Entity(entityname, ""), spiritName, storageName)
        }

        if(!room) logger.warn("ignoring entity room")
        logger.debug("get spirit goal Entity: '${spirit!!.entity.id}' storage: '${spirit!!.storage}' spirit: '${spirit!!.affordance}'")
        fur = ecwm!!.getSpiritGoal(spirit!!, if (forceMove) 0 else 255, if (forceMove) ECWMSpirit.BlockageHandling.USE_BEST else ECWMSpirit.BlockageHandling.USE_NEAREST, considerRoom = room)

        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        logger.debug("future is done'")

        fur?.get()?.let {
            when (it.status) {
                ECWMSpirit.SpiritGoalStatus.SUCCESS -> {
                    sg?.memorize(it.goal)
                    nav?.memorize(NavigationGoalData(it.goal.targetPose))
                    return tokenSuccess!!
                }
                else -> {
                    logger.error("could not get a goal for storage '${spirit!!.storage}' spirit '${spirit!!.affordance}'")
                    logger.error("Failed with ${it.status}")
                    if (logger.isDebugEnabled) ecwmRobocup?.getEntitySpirits(spirit!!.entity)?.get()!!.let { ss ->
                        logger.debug("entity has [storage] - spirit")
                        for (kv in ss) {
                            logger.debug("[${kv.key}]")
                            for (s in kv.value) {
                                logger.debug(" - $s")
                            }
                        }
                    }
                    return tokenError!!
                }
            }

        }

        return ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}