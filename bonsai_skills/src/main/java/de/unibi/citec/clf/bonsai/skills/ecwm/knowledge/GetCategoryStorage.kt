package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.ecwm.robocup.EntityStorage
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * Fetches the Entity and Storage for a given category
 *
 * <pre>
 *
 * Options:
 *  category:          [String] The category
 *
 * Slots:
 *  Type        [String] Optional, Use this if not set with Option
 *
 * ExitTokens:
 *  success.storage:        Found the Entity and known storage location for the category,
 *  success.no_storage:     Found the Entity which stores the given category (storage is undefined)
 *  error                   No Known Storage for the category found
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetCategoryStorage : AbstractSkill() {

    private val KEY_TYPE = "category"

    private var fur: Future<EntityStorage?>? = null
    private var ecwm: ECWMRobocup? = null
    private var tokenSuccessWithStorage: ExitToken? = null
    private var tokenSuccessNoStorage: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var slot: MemorySlotReader<String>? = null

    private var entity: MemorySlotWriter<Entity>? = null
    private var storage: MemorySlotWriter<String>? = null

    private var category: String = ""

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessWithStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("storage"))
        tokenSuccessNoStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("no_storage"))
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)

        entity = configurator.getWriteSlot("Entity", Entity::class.java)
        storage = configurator.getWriteSlot("Storage", String::class.java)

        if (configurator.hasConfigurationKey(KEY_TYPE)) {
            category = configurator.requestValue(KEY_TYPE)
        } else {
            slot = configurator.getReadSlot("Category", String::class.java)
        }
    }

    override fun init(): Boolean {
        if(slot != null) {
            category = slot?.recall<String>() ?: return false
        }

        logger.debug("get Category Storage for: '${category}'")
        fur = ecwm!!.getCategoryStorage(category)

        return true
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        try {
            fur?.get()?.let {
                if (it.entity.id.isEmpty()) {
                    return tokenError!!
                }
                logger.debug("Category Storage for: '${category}' is in ${it.entity.id} (${it.storage})")
                entity?.memorize(it.entity)
                if (it.storage.isNullOrEmpty()) {
                    return tokenSuccessNoStorage!!
                } else {
                    storage?.memorize(it.storage)
                    return tokenSuccessWithStorage!!
                }
            }
        } catch (e: ExecutionException ) {
            logger.error("could not get storage for category")
            return tokenError!!
        }

        return ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
