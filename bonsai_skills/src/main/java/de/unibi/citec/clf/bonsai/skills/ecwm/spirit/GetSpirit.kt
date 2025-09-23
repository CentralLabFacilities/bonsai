package de.unibi.citec.clf.bonsai.skills.ecwm.spirit

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import java.util.concurrent.Future
import kotlin.collections.iterator

/**
 * Fetches any Spirit from an ECWM Entity, does not check if goal is reachable
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Entity Name to fetch goals from
 *  spirit:     [String]
 *                  -> Spirit to get
 *  storage:    [String] Optional (default "")
 *                  -> Storage
 *  use_storage: [Boolean] Optional (default false)
 *                  -> if storage is not used, finds the first matching one if multiple exists
 *
 * Slots:
 *  Entity:   [Entity] Optional
 *                  -> Entity to fetch goals from, is used if the 'entity' option is not set
 *  Spirit:   [Spirit]
 *                  -> The Spirit
 *
 * ExitTokens:
 *  success:        Spirit exists
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMSpiritActuator: [ECWMSpirit]
 *      -> Used to get the current World Model
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetSpirit : AbstractSkill() {

    private val KEY_ENTITY = "entity"
    private val KEY_SPIRIT = "spirit"
    private val KEY_STORAGE = "storage"
    private val KEY_USE_STORAGE = "use_storage"

    private var ecwmRobocup: ECWMRobocup? = null
    private var tokenSuccess: ExitToken? = null

    private var spiritSlot: MemorySlotWriter<Spirit>? = null
    private var entity: MemorySlotReader<Entity>? = null
    private var storage: MemorySlotReader<String>? = null

    private var entityname: String = ""
    private var storagename: String = ""
    private var spiritname: String = ""
    private var useStorage = false

    private var fut: Future<Map<String, Set<String>>?>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        spiritSlot = configurator.getWriteSlot("Spirit", Spirit::class.java)

        ecwmRobocup = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)

        if (configurator.hasConfigurationKey(KEY_ENTITY)) {
            entityname = configurator.requestValue(KEY_ENTITY)
        } else {
            entity = configurator.getReadSlot("Entity", Entity::class.java)
        }

        useStorage = configurator.requestOptionalBool(KEY_USE_STORAGE, useStorage)

        if (configurator.hasConfigurationKey(KEY_STORAGE)) {
            storagename = configurator.requestValue(KEY_STORAGE)
            if(!useStorage) {
                useStorage = true
                logger.warn("parameter $KEY_STORAGE is set, forcing $KEY_USE_STORAGE")
            }
        } else if (useStorage) {
            storage = configurator.getReadSlot("Storage", String::class.java)
        }

        spiritname = configurator.requestValue(KEY_SPIRIT)


    }

    override fun init(): Boolean {
        if(entity != null) {
            val e = entity!!.recall<Entity>() ?: return false
            entityname = e.id
        }

        if(storage!= null) {
            storagename = storage!!.recall<String>() ?: return false
        }

        fut = ecwmRobocup?.getEntitySpirits(Entity(entityname,"")) ?: run {
            logger.error("entity '$entityname' has no spirits")
            return false
        }

        return true
    }

    override fun execute(): ExitToken {
        if(!fut!!.isDone) {
            return ExitToken.loop()
        }

        val allSpirits = fut!!.get() ?: run {
            logger.fatal("entity '$entityname' has not spirits")
            return ExitToken.fatal()
        }

        for (kv in allSpirits.entries) {
            logger.debug("[${kv.key}]")
            for (s in kv.value) {
                logger.debug(" - $s")
            }
        }

        var found = false
        if (useStorage) {
            found = allSpirits[storagename]?.contains(spiritname) ?: run {
                logger.error("could not get spirit: '$spiritname' in storage: '$storagename'")
                return ExitToken.fatal()
            }
        } else {
            for(s in allSpirits) {
                found = s.value.contains(spiritname)
                storagename = s.key
                if (found) break
            }
        }

        return if(found) {
            val spirit = Spirit(Entity(entityname,""), affordance = spiritname, storage = storagename)
            logger.info("memorize: $spirit")
            spiritSlot?.memorize(spirit)
            tokenSuccess!!
        } else {
            ExitToken.fatal()
        }

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
