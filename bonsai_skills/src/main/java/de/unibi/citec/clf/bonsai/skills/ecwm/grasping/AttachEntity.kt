package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.btl.data.world.Entity
import java.util.UUID

import java.util.concurrent.Future

/**
 * Attach an ECWM Entity to the gripper.
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Name of the attached entity
 *  type:       [String] Optional
 *                  -> Type of the attached entity
 *  use_slot:   [Boolean] Optional
 *                  -> read the entity from the specified slot instead of creating a new one
 *  create:     [Boolean] Optional
 *                  -> create a new entity with the given data, fails if the entity already exists
 *
 * Slots:
 *  Entity:   [Entity] Read/Write
 *                  -> Read: Entity to be attached
 *                  -> Write: Attached Entity
 *
 * ExitTokens:
 *  success:    Attached entity to the gripper
 *
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGrasping]
 *
 * </pre>
 *
 * @author lruegeme, jzilke
 */
class AttachEntity : AbstractSkill() {

    private val KEY_NAME = "entity"
    private val KEY_TYPE = "type"
    private val KEY_USE_SLOT = "use_slot"
    private val KEY_CREATE = "create"
    private var entityName: String = "unknown"
    private var entityType: String = "object/unknown"

    private var fur: Future<Boolean>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null

    private var entity: Entity? = null
    private var create = true

    private var slot: MemorySlot<Entity>? = null
    private var slotTypename: MemorySlotReader<String>? = null
    private var useSlot = false
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        slot = configurator.getReadWriteSlot("Entity", Entity::class.java)

        useSlot = configurator.requestOptionalBool(KEY_USE_SLOT, useSlot)
        create = configurator.requestOptionalBool(KEY_CREATE, create)

        if (configurator.hasConfigurationKey(KEY_TYPE)) {
            entityType = configurator.requestValue(KEY_TYPE)
        } else if (!useSlot) {
            slotTypename = configurator.getReadSlot("Type", String::class.java)
        }

        if (configurator.hasConfigurationKey(KEY_NAME)) {
            entityName = configurator.requestValue(KEY_NAME)
        } else {
            entityName = UUID.randomUUID().toString()
        }

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)
    }

    override fun init(): Boolean {
        entityType = slotTypename?.recall<String>() ?: entityType
        entity = if (useSlot) slot?.recall<Entity>() else Entity(entityName!!, entityType)
        logger.debug("try to attach $entity")

        fur = ecwm?.attachEntity(entity!!, create = create)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        if(fur!!.get()) {
            slot!!.memorize(entity!!)

            return tokenSuccess!!
        } else {
            return ExitToken.fatal()
        }
        
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
