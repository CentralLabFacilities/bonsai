package de.unibi.citec.clf.bonsai.skills.ecwm.knowledge

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributes
import de.unibi.citec.clf.btl.data.ecwm.robocup.ModelWithAttributesList
import java.util.concurrent.Future
import java.util.regex.Matcher

/**
 * Takes in the given name of an object and returns its category and default storage (along with the container entity).
 *
 * <pre>
 *
 * Options:
 *  MSG:                 [String] Message to say. variables: #S=storage #C=category #E=entity(container) #N=giveName
 *
 * Slots:
 *  GivenName:              [String] [Read]
 *                          -> The given name of an object, if #_NAME is not set
 *  Storage:                [String] [Write]
 *                          -> The default storage of this object
 *  Container:              [Entity] [Write]
 *                          -> Which entity this storage belongs to
 *  Category:               [String] [Write]
 *                          -> What category this object has
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
class GetCategoryStorageForGivenName : AbstractSkill() {
    private var speechActuator: SpeechActuator? = null
    private var givenName: String = ""
    private var tokenSuccessWithStorage: ExitToken? = null
    private var tokenSuccessNoStorage: ExitToken? = null
    private var tokenNoType: ExitToken? = null
    private var tokenNoStorage: ExitToken? = null
    private var givenNameSlot: MemorySlotReader<String>? = null
    private var categorySlot: MemorySlotWriter<String>? = null
    private var storageSlot: MemorySlotWriter<String>? = null
    private var entitySlot: MemorySlotWriter<Entity>? = null
    private var ecwm: ECWMRobocup? = null
    private var fur: Future<ModelWithAttributesList?>? = null
    private var talk: Future<Void>? = null
    private var message = ""
    private var storage = "";

    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessWithStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("withStorage"))
        tokenSuccessNoStorage = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noStorage"))
        tokenNoType = configurator.requestExitToken(ExitStatus.ERROR().ps("noType"))
        tokenNoStorage = configurator.requestExitToken(ExitStatus.ERROR().ps("noCategoryStorage"))
        givenNameSlot = configurator.getReadSlot<String>("GivenName", String::class.java)
        storageSlot = configurator.getWriteSlot<String>("Storage", String::class.java)
        categorySlot = configurator.getWriteSlot<String>("Category", String::class.java)
        entitySlot = configurator.getWriteSlot<Entity>("Entity", Entity::class.java)
        ecwm = configurator.getActuator<ECWMRobocup>("ECWMRobocup", ECWMRobocup::class.java)
        message = configurator.requestOptionalValue("MSG", message)
        if(message.isNotEmpty()) {
            speechActuator = configurator.getActuator<SpeechActuator>("SpeechActuator", SpeechActuator::class.java)
        }
        
    }

    override fun init(): Boolean {
        givenName = givenNameSlot?.recall<String>()?.lowercase() ?: run {
            logger.debug("givenNameSlot empty")
            return false
        }

        logger.debug("get all types")
        fur = ecwm?.getAllModels() ?: run {
            logger.debug("actuator error")
            return false
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
        val modelList: ModelWithAttributesList = fur!!.get() ?: ModelWithAttributesList()

        var model: ModelWithAttributes? = null
        for (m in modelList) {
            if (m.getAttributes()["given_name"]?.firstOrNull()?.lowercase() == givenName) {
                model = m
                break
            }
        }

        if(model == null) {
            logger.error("model with given_name: $givenName not found")
            return tokenNoType!!
        }

        val category = model.getAttributes()["category"]?.firstOrNull() ?: run {
            logger.error("object has no category, using unknown")
            "unknown"
        }
        categorySlot?.memorize(category)

        logger.debug("get Category Storage for: $category")

        val entityStorage = try {
            ecwm!!.getCategoryStorage(category)?.get()!!
        } catch (e: Exception) {
            logger.error("could not get a category storage")
            return tokenNoStorage!!
        }

        logger.debug("category storage is $entityStorage")
        entitySlot?.memorize(entityStorage.entity)
        if (entityStorage.storage?.isEmpty() == false) {
            logger.debug("Storage: " + entityStorage.storage)
            storageSlot!!.memorize<String>(entityStorage.storage)
            storage = entityStorage.storage!!
        }

        if(message.isEmpty())
            return if (storage.isEmpty())tokenSuccessWithStorage!! else tokenSuccessNoStorage!!

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
