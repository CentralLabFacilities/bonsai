package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.actuators.ECWMActuator
import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.btl.data.ecwm.EntityList

import java.util.concurrent.Future

class ClearPlanningScene : AbstractSkill() {

    private val KEY_CLEARATTACHED= "clear_attached"

    private var fur: Future<Boolean>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null

    private var clear_attached = false

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        clear_attached = configurator.requestOptionalBool(KEY_CLEARATTACHED, clear_attached)

    }

    override fun init(): Boolean {
        fur = ecwm?.setupPlanningScene(listOf(),true,clear_attached)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        return if (fur!!.get()) tokenSuccess!! else ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
