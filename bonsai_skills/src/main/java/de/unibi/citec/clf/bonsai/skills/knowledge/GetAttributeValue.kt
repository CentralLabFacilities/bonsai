package de.unibi.citec.clf.bonsai.skills.knowledge

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.knowledge.Attributes
import java.util.concurrent.ExecutionException

/**
 * Fetches an value of the given Attributes
 *
 * <pre>
 *
 * Options:
 *  error_on_multiple   [Boolean] Error if values.size()>1, else we just get the first (default: True)
 *  attribute:          [String] The attribute key
 *
 * Slots:
 *  Attributes  [Attributes] Attributes
 *  Value:      [String] The Attribute Value
 *
 * ExitTokens:
 *  Error.missing:        does not have the requested attribute
 *  Error.multiple:       does have multiple values for the requested attribute
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetAttributeValue : AbstractSkill() {

    private val KEY_ATTRIBUTE = "attribute"
    private val KEY_ERROR = "error_on_multiple"

    private var key = ""

    private var tokenSuccess: ExitToken? = null
    private var tokenErrorMissing: ExitToken? = null
    private var tokenErrorMultiple: ExitToken? = null

    private var slot: MemorySlotReader<Attributes>? = null
    private var result: MemorySlotWriter<String>? = null
    private lateinit var attributes: Attributes

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorMissing = configurator.requestExitToken(ExitStatus.ERROR().ps("missing"))
        if(configurator.hasConfigurationKey(KEY_ERROR)) {
            tokenErrorMultiple = configurator.requestExitToken(ExitStatus.ERROR().ps("multiple"))
        }

        key = configurator.requestValue(KEY_ATTRIBUTE)
        slot = configurator.getReadSlot<Attributes>("Attributes", Attributes::class.java)
        result = configurator.getWriteSlot("Value", String::class.java)
    }

    override fun init(): Boolean {
        attributes = slot?.recall<Attributes>() ?: run {
            logger.error("Attributes null")
            return false
        }

        return true
    }

    override fun execute(): ExitToken {

        if (logger.isDebugEnabled) {
            logger.debug("Got attributes:")
            for (kv in attributes.attributeListMap) {
                logger.debug(" - '${kv.key}': '${kv.value}'")
            }
        }

        if (attributes.hasAttribute(key)) {
            val values = attributes.getAttribute(key)!!
            if(tokenErrorMultiple != null && values.size > 1 ) {
                logger.debug("Got attribute multipleValues: '${values}' and $KEY_ERROR is set")
                return tokenErrorMultiple!!
            }
            logger.debug("Got attribute values: '${values}' memorize first element")
            result!!.memorize(values.first())
        } else {
            return tokenErrorMissing!!
        }
        return tokenSuccess!!

    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
