package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.actuators.TrackingActuator
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.units.LengthUnit
import net.sf.saxon.functions.ConstantFunction.True
import java.util.concurrent.Future

/**
 *
 * <pre>
 *
 * ExitTokens:
 *   error:              did not find a person to track
 *   success:            all good
 *
 * Actuators:
 *   ClfTracker: [TrackingActuator]
 *      -> Called to start tracking
 *
 * </pre>
 *
 *
 * @author lruegeme
 */
class TrackPerson : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null
    private var trackingActuator: TrackingActuator? = null
    private var personDataSlot: MemorySlotReader<PersonData>? = null
    private var trackingFut: Future<Boolean>? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        trackingActuator = configurator.getActuator("ClfTracker", TrackingActuator::class.java)
        personDataSlot = configurator.getReadSlot("PersonDataSlot", PersonData::class.java)
    }

    override fun init(): Boolean {
        val person = personDataSlot?.recall<PersonData>() ?: run {
            logger.error("person error")
            return false
        }

        if (person.headPosition.getZ(LengthUnit.METER).isNaN()) {
            logger.error("head error")
            return false
        }

        trackingFut = trackingActuator?.startTracking(person.headPosition, 0.5)

        return trackingFut != null
    }

    override fun execute(): ExitToken {
        if (trackingFut?.isDone != true) {
            return ExitToken.loop(100)
        }

        return if(trackingFut?.get() == true) tokenSuccess!! else tokenError!!;
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
