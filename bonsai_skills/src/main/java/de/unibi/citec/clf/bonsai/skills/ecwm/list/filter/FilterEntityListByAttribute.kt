package de.unibi.citec.clf.bonsai.skills.ecwm.list.filter

import de.unibi.citec.clf.bonsai.actuators.ECWMRobocup
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.EntityList

/**
 * Filters a [EntityList] for an attribute (e.g. category) containing the given value.
 *
 * <pre>
 *
 * Options:
 *  #_ATTRIBUTE:        [String]
 *                          -> What attribute should be compared (category, given_name, ect.)
 *  #_VALUE:            [String] Optional
 *                          -> the value the attribute needs to contain
 *  #_INVERT:           [Boolean] Optional Default: false
 *                          -> remove entities of this category from the list
 * Slots:
 *  EntityList: [EntityList] [Read] [Write]
 *      -> the list to be filtered
 *  Value: [String] (Read, Optional)
 *      -> value of the designated attribute to act as a filter, if not set as an option
 *
 * ExitTokens:
 * success:                 Filtered the list
 * success.empty:           Filtered the list, which is empty now
 *
 * </pre>
 *
 * @author lruegeme
 */
class FilterEntityListByAttribute : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null
    private var tokenSuccessEmpty: ExitToken? = null

    private var listSlot: MemorySlot<EntityList>? = null
    private var entitylist: EntityList? = null
    private var key: String = ""
    private var valueSlot: MemorySlotReader<String>? = null
    private var value: String? = ""

    private var invert = false

    private var ecwm: ECWMRobocup? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("empty"))

        listSlot = configurator.getReadWriteSlot("EntityList", EntityList::class.java)
        key = configurator.requestValue("#_ATTRIBUTE")
        if (configurator.hasConfigurationKey("#_VALUE")) {
            value = configurator.requestValue("#_VALUE")
        } else {
            valueSlot = configurator.getReadSlot("Value", String::class.java)
        }
        invert = configurator.requestOptionalBool("#_INVERT", invert)
        ecwm = configurator.getActuator("ECWMRobocup", ECWMRobocup::class.java)
    }

    override fun init(): Boolean {
        key = key.lowercase()

        entitylist = listSlot!!.recall<EntityList>() ?: return false
        value = valueSlot?.recall<String>() ?: value
        value = value?.lowercase()
        return true
    }


    override fun execute(): ExitToken {
        logger.debug("Filter by $key: $value")

        val filtered = entitylist!!.filter { e ->
            val attributeValues = ecwm?.getEntityAttributes(e)?.get()?.getAttribute(key) ?: listOf()
            logger.debug("entity ${e.id} has $key: $attributeValues")
            val match = attributeValues.contains(value)
            if (invert) !match else match
        }

        val newEntityList = EntityList().apply { addAll(filtered) }
        listSlot!!.memorize(newEntityList)

        logger.debug("Filtered List:")
        for (e in newEntityList) {
            logger.debug("  - $e")
        }
        return if (newEntityList.isEmpty()) tokenSuccessEmpty!! else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
