package de.unibi.citec.clf.bonsai.skills.slots

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.List
import java.lang.reflect.InvocationTargetException

/**
 * Clear content of any List.
 *
 * <pre>
 *
 * Slots:
 * StringSlot: [String] [Read/Write]
 * -> Memory slot the content will be cleared from
 *
 * ExitTokens:
 * success:            Cleared slot successfully
 * fatal:              Error while writing to memory
 *
 * Sensors:
 *
 * Actuators:
 *
</pre> *
 *
 * @author lruegeme
 */
class ClearList<L : List<*>?> : AbstractSkill() {
    // used tokens
    private var tokenSuccess: ExitToken? = null

    // Defaults
    private val read: L? = null

    var slot: MemorySlotWriter<L?>? = null

    private var listType: Class<L?>? = null

    override fun configure(configurator: ISkillConfigurator) {
        val listTypeString: String? = configurator.requestValue(KEY_LIST_TYPE)

        try {
            listType = Class.forName(listTypeString) as Class<L?>
        } catch (e: ClassNotFoundException) {
            throw ConfigurationException(e)
        }

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        slot = configurator.getWriteSlot<L?>("List", listType)
    }

    override fun init(): Boolean {
        return true
    }

    override fun execute(): ExitToken? {
        try {
            slot?.memorize(listType!!.getDeclaredConstructor().newInstance())
        } catch (e: CommunicationException) {
            logger.error(e.message)
            return ExitToken.fatal()
        } catch (e: InvocationTargetException) {
            logger.error(e.message)
            return ExitToken.fatal()
        } catch (e: InstantiationException) {
            logger.error(e.message)
            return ExitToken.fatal()
        } catch (e: IllegalAccessException) {
            logger.error(e.message)
            return ExitToken.fatal()
        } catch (e: NoSuchMethodException) {
            logger.error(e.message)
            return ExitToken.fatal()
        }
        return tokenSuccess
    }

    override fun end(curToken: ExitToken?): ExitToken? {
        return curToken
    }

    companion object {
        private const val KEY_LIST_TYPE = "#_LIST_TYPE"
    }
}
