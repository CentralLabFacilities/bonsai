package de.unibi.citec.clf.bonsai.skills.dialog.nlu

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.speech.NLU
import de.unibi.citec.clf.btl.data.speech.NLUEntity

/**
 *  Load an NLU with the given #_INTENT into a slot.
 *
 *  Takes Parametes of the form #ENTITY:ROLE:GROUP" to create entities
 *
 *  example:
 *  <pre>
 *      <datamodel>
 *             <data id="#object" expr="'apple'"/>
 *             <data id="#location:destination" expr="'me'"/>
 *             <data id="#location:departure" expr="'table'"/>
 *             <data id="#_INTENT" expr="'pick_place'"/>
 *      </datamodel>
 *  </pre>
 *
 * <pre>
 *
 * Options:
 *  #_INTENT:               [String]
 *                              -> the intent
 *  'ENTITY[:ROLE][:GROUP]':
 *                              -> Entities to create (see example)
 *
 * Slots:
 *  NLUSlot
 *
 * ExitTokens:
 *  success
 *
 * </pre>
 *
 * @author lruegeme
 */
class LoadNLU : AbstractSkill() {

    private var intent = ""
    private var tokenSuccess: ExitToken? = null
    private var nluSlot: MemorySlotWriter<NLU>? = null
    private var entityMap: MutableMap<String,String> = HashMap()

    private lateinit var nlu: NLU

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        intent = configurator.requestValue("#_INTENT")

        nluSlot = configurator.getWriteSlot("NLUSlot", NLU::class.java)
        for (item in configurator.configurationKeys) {
            if(item.startsWith("#_")) continue
            if(item.startsWith("#")) {
                val a = configurator.requestValue(item)
                entityMap[item.substring(1)] = a
            }
        }

    }

    override fun init(): Boolean {
        return true
    }

    override fun execute(): ExitToken {

        val entities: MutableList<NLUEntity> = mutableListOf()

        for (item in entityMap) {
            val mapping = item.key
            val match = mapping.split(":")
            logger.trace("splitting '$mapping' on ':' has ${match.size} values")
            if (match.isEmpty() || match.size > 3) {
                logger.error("splitting failed for '$mapping', empty or > 3 $match")
                return ExitToken.fatal()
            }
            val key = match.first()
            val role = if (match.size >= 2 ) match[1] else ""
            val group = if (match.size == 3) match[2].toInt() else -1
            entities.add(NLUEntity(key = key, value = item.value, role = role, group = group))
        }

        nlu = NLU(t = "", i = intent, conf = 1f, es = entities )
        logger.info("memorizing $nlu")
        nluSlot?.memorize(nlu)
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
