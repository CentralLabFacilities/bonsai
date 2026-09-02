package de.unibi.citec.clf.bonsai.skills.ecwm.list.filter

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.EntityList
/**
 * Filters an [EntityList]  by the model type of each entity.
 *
 *
 * <pre>
 *
 * Options:
 *  #_PATTERN:          [String] Optional
 *                      -> Pattern used to match the entity model types.
 *                      -> If not configured, the pattern is read from
 *                         the Pattern slot.
 *
 *  #_INVERT:           [Boolean] Optional (Default: false)
 *                      -> Invert the matching result.
 *                      -> If true, matching entities are removed and
 *                         non-matching entities are kept.
 *
 *  #_REGEX:            [Boolean] Optional (Default: true)
 *                      -> Interpret #_PATTERN as a regular expression.
 *                      -> If false, the pattern is compared directly
 *                         with the entity model name.
 *
 * Slots:
 *  Pattern:            [String] [Read] Optional
 *                      -> Pattern used to filter entity types.
 *                      -> Used when #_PATTERN is not configured.
 *
 *  EntityList:         [EntityList] [Read]
 *                      -> Input list of entities that shall be filtered.
 *
 *  FilteredEntities:   [EntityList] [Write]
 *                      -> Output list containing the entities that
 *                         passed the filter.
 *
 * ExitTokens:
 *  success.empty:      The filtering completed and the resulting list
 *                      is empty.
 *
 *  success.notEmpty:   The filtering completed and the resulting list
 *                      contains at least one entity.
 *
 * </pre>
 *
 * @author lruegeme, lgraesner
 */
class FilterEntityListByType : AbstractSkill() {

    private var tokenSuccess: ExitToken? = null
    private var tokenEmptyFilteredList: ExitToken? = null

    private var entityListMemorySlot: MemorySlotReader<EntityList>? = null
    private var filteredListMemorySlot: MemorySlotWriter<EntityList>? = null

    private val KEY_PATTERN = "#_PATTERN"
    private val KEY_INVERT = "#_INVERT"
    private val KEY_REGEX = "#_REGEX"

    private var entitylist: EntityList? = null

    private var pattern: String = ""
    private var invert: Boolean = false
    private var useRegex = true

    private var typePatternSlot: MemorySlotReader<String>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notEmpty"))
        tokenEmptyFilteredList = configurator.requestExitToken(ExitStatus.SUCCESS().ps("empty"))

        entityListMemorySlot = configurator.getReadSlot("EntityList", EntityList::class.java)
        filteredListMemorySlot = configurator.getWriteSlot("FilteredEntities", EntityList::class.java)

        pattern = configurator.requestOptionalValue(KEY_PATTERN, pattern)
        if (!configurator.hasConfigurationKey(KEY_PATTERN)) {
            typePatternSlot = configurator.getReadSlot("Pattern", String::class.java)
        }

        invert = configurator.requestOptionalBool(KEY_INVERT, invert)
        useRegex = configurator.requestOptionalBool(KEY_REGEX, useRegex)

    }

    override fun init(): Boolean {
        pattern = typePatternSlot?.recall<String>() ?: pattern

        entitylist = entityListMemorySlot?.recall<EntityList>() ?: run {
            logger.warn("input list is null, returning empty list")
            EntityList()
        }

        return true
    }

    override fun execute(): ExitToken {
        logger.debug("Filter Pattern: $pattern")
        val newEntityList = EntityList()

        for (entity in entitylist!!) {
            logger.debug("Trying to match with type: ${entity.modelName}")

            val match =
                if (useRegex) pattern.toRegex().matches(entity.modelName) else (pattern == entity.modelName)

            if (invert xor match) {
                newEntityList.add(entity)
            }
        }

        filteredListMemorySlot!!.memorize(newEntityList)

        return if (newEntityList.isEmpty()) {
            logger.debug("Filtered List is empty")
            tokenEmptyFilteredList!!
        } else {
            logger.debug("Filtered List:")
            if(logger.isDebugEnabled) for (e in newEntityList) {
                logger.debug("  - $e")
            }
            tokenSuccess!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
