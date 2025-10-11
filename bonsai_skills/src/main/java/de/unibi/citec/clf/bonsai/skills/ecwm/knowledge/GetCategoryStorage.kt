package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.btl.data.knowledge.Attributes
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.Model
import java.util.concurrent.Future
import java.util.regex.Matcher

/**
 * Takes in the given name of an object and returns its category and default storage (along with the container entity).
 *
 * Default to read Entity, but can also read from Category or Model
 *
 * <pre>
 *
 * Options:
 *  MSG:                    [String] (Optional)  Message to say. variables: #S=storage #C=category #E=entity(container) #N=giveName
 *  USE_CATEGORY            [Boolean] Read from `Category` Slot (default: false)
 *  USE_MODEL               [Boolean] Read from `Model` Slot (default: false)
 *
 * Slots:
 *  Entity:                 [Entity] (Read, Optional)
 *                              -> The Entity to get the category from
 *  Model:                  [Entity] (Read, Optional)
 *                              -> The Entity to get the category from
 *  Storage:                [String] (Write)
 *                              -> The default storage of this object
 *  Container:              [Entity] (Write)
 *                              -> Which entity this storage belongs to
 *  Category:               [String] (Read or Write)
 *                              -> What category this object has
 *
 * ExitTokens:
 *  success.storage:        Found the Container Entity and known storage location for the objects category,
 *  success.no_storage:     Found the Container Entity but no storage
 *  error                   No Known Storage for the category found
 *
 * </pre>
 *
 * @author lruegeme, lgraesner
 */
class GetCategoryStorage : AbstractSkill() {
    private val KEY_CATEROY = "USE_CATEGORY"
    private val KEY_MODEL = "USE_MODEL"
    private val KEY_MSG = "MSG"

    private var speechActuator: SpeechActuator? = null
    private var tokenSuccessWithStorage: ExitToken? = null
    private var tokenSuccessNoStorage: ExitToken? = null

    private var tokenNoStorage: ExitToken? = null

    private var categoryInSlot: MemorySlotReader<String>? = null
    private var entityInSlot: MemorySlotReader<Entity>? = null
    private var modelInSlot: MemorySlotReader<Model>? = null

    private var categorySlot: MemorySlotWriter<String>? = null
    private var storageSlot: MemorySlotWriter<String>? = null
    private var containerSlot: MemorySlotWriter<Entity>? = null

    private var ecwm: ECWMRobocup? = null
    private var fur: Future<Attributes?>? = null
    private var talk: Future<Void>? = null
    private var message = ""

    private var storage = "";

    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessWithStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("withStorage"))
        tokenSuccessNoStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noStorage"))
        tokenNoStorage = configurator.requestExitToken(ExitStatus.ERROR().ps("noCategoryStorage"))

        ecwm = configurator.getActuator<ECWMRobocup>("ECWMRobocup", ECWMRobocup::class.java)

        val useCat = configurator.requestOptionalBool(KEY_CATEROY, false)
        val useModel = configurator.requestOptionalBool(KEY_MODEL, false)
        if(useCat && useModel) {
            throw ConfigurationException("cant combine $KEY_CATEROY with $KEY_MODEL")
        }

        if(useCat) {
            categoryInSlot = configurator.getReadSlot<String>("Category", String::class.java)
        } else {
            categorySlot = configurator.getWriteSlot<String>("Category", String::class.java)
        }

        if(useModel) {
            modelInSlot = configurator.getReadSlot<Model>("Model", Model::class.java)
        } else {
            entityInSlot = configurator.getReadSlot<Entity>("Entity", Entity::class.java)
        }

        storageSlot = configurator.getWriteSlot<String>("Storage", String::class.java)
        containerSlot = configurator.getWriteSlot<Entity>("Container", Entity::class.java)

        message = configurator.requestOptionalValue(KEY_MSG, message)
        if(message.isNotEmpty()) {
            speechActuator = configurator.getActuator<SpeechActuator>("SpeechActuator", SpeechActuator::class.java)
        }
        
    }

    override fun init(): Boolean {

        modelInSlot?.recall<Model>().also{
            if (it == null) {
                logger.error("Model is null")
                return false
            }
            fur = ecwm?.getModelAttributes(it.typeName)
        } ?: entityInSlot?.recall<Entity>().also {
            if (it == null) {
                logger.error("Entity is null")
                return false
            }
            fur = ecwm?.getEntityAttributes(it)
        }

        return true
    }

    override fun execute(): ExitToken {
        if (!fur!!.isDone) {
            return ExitToken.loop()
        }

        if(talk != null) {
            return if(!talk!!.isDone) {
                ExitToken.loop()
            } else {
                if (storage.isEmpty()) tokenSuccessWithStorage!! else tokenSuccessNoStorage!!
            }
        }


        val attributes: Attributes = fur!!.get() ?: Attributes.empty()
        val category = attributes.getFirstAttributeOrNull("category") ?: run {
            logger.warn("object has no category, using unknown")
            "unknown"
        }
        val givenName = attributes.getFirstAttributeOrNull("given_name") ?: attributes.reference
        categorySlot?.memorize(category)

        logger.debug("get Category Storage for: $category")

        val entityStorage = try {
            ecwm!!.getCategoryStorage(category).get()!!
        } catch (e: Exception) {
            logger.error("could not get a category storage")
            return tokenNoStorage!!
        }

        logger.debug("category storage is $entityStorage")
        containerSlot?.memorize(entityStorage.entity)
        if (entityStorage.storage?.isEmpty() == false) {
            logger.debug("Storage: " + entityStorage.storage)
            storageSlot!!.memorize<String>(entityStorage.storage)
            storage = entityStorage.storage!!
        }

        if(message.isEmpty())
            return if (storage.isEmpty()) tokenSuccessWithStorage!! else tokenSuccessNoStorage!!

        if (!storage.startsWith("on")) storage = "in $storage"
        message = message.replace(Matcher.quoteReplacement("#S"), storage);
        message = message.replace(Matcher.quoteReplacement("#C"), category);
        message = message.replace(Matcher.quoteReplacement("#E"), entityStorage.entity.id);
        message = message.replace(Matcher.quoteReplacement("#N"), givenName);
        message = message.replace("_", " ");
        logger.info("saying: $message")
        talk = speechActuator!!.sayAsync(message)
        return ExitToken.loop()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
