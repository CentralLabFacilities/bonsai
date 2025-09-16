package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speechrec.NLU

/**
 *  Unpacks Entities from NLU into Slots
 *
 *  Takes Parametes of the form #ENTITY:ROLE:GROUP to unpack entities into specific slots
 *
 *
 *  example:
 *  <pre>
 *      <datamodel>
 *             <data id="#object"/>
 *             <data id="#location:destination"/>
 *             <data id="#location:departure"/>
 *             <data id="#_INTENT" expr="'pick_place'"/>
 *      </datamodel>
 *  </pre>
 *
 *
 * <pre>
 *
 * Options:
 *  #_INTENT:               [String] (optional)
 *                              -> check for matching intent, use ';' for multiple ("intentA;intentB..")
 *  #'ENTITY[:ROLE][:GROUP]':
 *                              -> Entities to unpack (see example)
 * Slots:
 *  all defined Parameters as WriteSlot [String]
 *                              -> value of the entity
 *
 * ExitTokens:
 *  success
 *  error.missing.entity.role.group     Specific Entity is missing from NLU
 *  error.wrongIntent:                  Intent is not #_INTENT (if defined)
 *
 * </pre>
 *
 * @author lruegeme
 */
class UnpackNLU : AbstractSkill() {

    private var intent = ""
    private var tokenSuccess: ExitToken? = null
    private var tokenErrorIntent: ExitToken? = null
    private var nluSlot: MemorySlotReader<NLU>? = null
    private var entitySet: MutableSet<String> = HashSet()
    private var slotMapping: MutableMap<String, MemorySlotWriter<String>?> = HashMap()
    private val tokenMap = HashMap<String, ExitToken>()

    private lateinit var nlu: NLU

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        if (configurator.hasConfigurationKey("#_INTENT")) {
            intent = configurator.requestValue("#_INTENT")
            tokenErrorIntent = configurator.requestExitToken(ExitStatus.ERROR().ps("wrongIntent"))
        }

        nluSlot = configurator.getReadSlot("NLUSlot", NLU::class.java)
        for (item in configurator.configurationKeys) {
            if (item.startsWith("#_")) continue
            if (item.startsWith("#")) {
                entitySet.add(item.substring(1))
                configurator.requestValue(item)
            }
        }

        for (item in entitySet) {
            slotMapping[item] = configurator.getWriteSlot(item, String::class.java)
            val status = item.replace(':', '.')
            tokenMap[item] = configurator.requestExitToken(ExitStatus.ERROR().ps(status))
        }
    }

    override fun init(): Boolean {
        nlu = nluSlot?.recall<NLU>() ?: return false
        return true
    }

    override fun execute(): ExitToken {
        if (intent.isNotEmpty()) {
            val intents = intent.split(";")
            if (!intents.contains(nlu.intent)) {
                logger.error("wrong intent '${nlu.intent}' should be any of '$intent'")
                return tokenErrorIntent!!
            }
        }

        for (item in entitySet) {
            val match = item.split(":")
            logger.trace("splitting '$item' on ':' has ${match.size} values")
            if (match.isEmpty() || match.size > 3) {
                logger.error("spltting into: ${match.size} (>3 or 0)" )
                return ExitToken.fatal()
            }

            val key = match.first()
            val role = if (match.size >= 2) match[1] else ""
            val group = if (match.size == 3) match[2].toInt() else null
            val filtered = nlu.getEntities()
                .filter {
                    (it.key == key) &&
                    (it.role == role || (role.isEmpty() && it.role.isNullOrEmpty())) &&
                    (it.group == group || (group == null && (it.group == -1 || it.group == 0) ) )
                }

            if (filtered.size != 1) {
                logger.error("${if (filtered.isEmpty()) "missing" else "multiple"} entity with key:'$key' role:'$role' group:'$group'")
                nlu.getEntities().forEach { logger.warn("- have: key:'${it.key}' role:'${it.role}' group:'${it.group}'") }
                return tokenMap[item]!!
            }

            val value = filtered.first().value
            logger.info("memorize '$value' to slot '$item'")
            slotMapping[item]?.memorize(value)
        }
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
