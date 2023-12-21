package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMCore
import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.ecwm.EntityList
import de.unibi.citec.clf.btl.data.ecwm.SpiritGoal
import de.unibi.citec.clf.btl.data.ecwm.StorageList
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData
import java.util.concurrent.Future

/**
 * Retrieves all storages from an ECWM Entity
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Entity Name to fetch goals from
 *
 * Slots:
 *  Entity:   [Entity] Optional
 *                  -> Entity to retrieve storages from, used if the 'entity' option is not set
 *  Storages [StorageList]
 *                  -> A list of present storages
 *
 * ExitTokens:
 *  success:    Wrote a list of storages to the slot. If none were present the list will be empty.
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
    private var entityName: String? = null

    private var tokenSuccess: ExitToken? = null

    private var entitySlot: MemorySlotReader<Entity>? = null
    private var storageListSlot: MemorySlotWriter<StorageList>? = null

    private var ecwm: ECWMCore? = null

    private var fur: Future<StorageList?>? = null



    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMCore", ECWMCore::class.java)

        storageListSlot = configurator.getWriteSlot("Storages", StorageList::class.java)

        entityName = configurator.requestOptionalValue(KEY_ENTITY, entityName)
        if(entityName == null || entityName == "null") entitySlot = configurator.getReadSlot("Entity", Entity::class.java)


    }

    override fun init(): Boolean {
        var entity : Entity? = null
        entity = if(entityName == null || entityName == "null") {
            entitySlot?.recall<Entity>() ?: return false
        } else {
            Entity(entityName!!)
        }

        fur = ecwm!!.fetchEntityStorages(entity!!)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        var res = fur!!.get() ?: return ExitToken.fatal()

        storageListSlot?.memorize(res)

        return tokenSuccess!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
