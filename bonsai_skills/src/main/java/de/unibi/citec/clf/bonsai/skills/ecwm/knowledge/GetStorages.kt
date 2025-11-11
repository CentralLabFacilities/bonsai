package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.StorageList
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.concurrent.Future

/**
 * Retrieves all storages from an ECWM Entity
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Entity id to fetch goals from
 *
 * Slots:
 *  Entity:   [de.unibi.citec.clf.btl.data.world.Entity] Optional
 *                  -> Entity to retrieve storages from, used if the 'entity' option is not set
 *  Storages [de.unibi.citec.clf.btl.data.ecwm.StorageList]
 *                  -> A list of present storages
 *
 * ExitTokens:
 *  success:        Wrote a list of storages to the slot.
 *  error.none:     The Entity has no storages - wrote an empty list.
 *
 *
 * Actuators:
 *  ECWMCoreActuator: [ECWMCORE]
 *      -> Used to get the current World Model
 *
 * </pre>
 *
 * @author lruegeme
 */


class GetStorages : AbstractSkill() {

    private val KEY_ENTITY= "entity"
    private var id: String? = null

    private var tokenSuccess: ExitToken? = null
    private var tokenErrorNone: ExitToken? = null

    private var entitySlot: MemorySlotReader<Entity>? = null
    private var storageListSlot: MemorySlotWriter<StorageList>? = null

    private var ecwm: ECWMSpirit? = null

    private var fur: Future<StorageList?>? = null



    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorNone = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("none"))

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)

        storageListSlot = configurator.getWriteSlot("Storages", StorageList::class.java)

        if (configurator.hasConfigurationKey(KEY_ENTITY)) {
            id = configurator.requestOptionalValue(KEY_ENTITY, id)
        } else {
            entitySlot = configurator.getReadSlot("Entity", Entity::class.java)
        }

    }

    override fun init(): Boolean {

        var entity = entitySlot?.recall<Entity>() ?: Entity(id!!)

        fur = ecwm!!.fetchEntityStorages(entity)
        logger.debug("fetching storages from ${entity.id}")

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        val res = fur!!.get() ?: return ExitToken.fatal()


        for (a in res) {
            logger.debug("- ${a.name}")
        }

        storageListSlot?.memorize(res)

        return if (res.isNotEmpty()) tokenSuccess!! else tokenErrorNone!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}