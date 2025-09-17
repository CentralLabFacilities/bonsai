package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.actuators.TrackingActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.units.LengthUnit
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

    private val lu: LengthUnit = LengthUnit.METER

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

        //val p : Point3D = Point3D(person.position.getX(lu), person.position.getY(lu), 1.0, lu ).apply {
        //    frameId = person.position.frameId
        //}

       val p : Point3D = if (person.headPosition?.getZ(LengthUnit.METER)?.isNaN() != false) {
            Point3D(person.position.getX(lu), person.position.getY(lu), 1.0, lu )
        } else {
            logger.info("using head pose")
            Point3D(person.headPosition.getX(lu).toFloat(), person.headPosition.getY(lu).toFloat(), person.headPosition.getZ(lu).toFloat())
        }
        logger.info("tracking person near: $p")
        trackingFut = trackingActuator?.startTracking(p, 1.0)

        return trackingFut != null
    }

    override fun execute(): ExitToken {
        if (trackingFut?.isDone != true) {
            return ExitToken.loop(100)
        }

        return if (trackingFut?.get() == true) run {
            logger.info("track person success")
            tokenSuccess!!
        } else run {
            logger.error("found no person close to point")
            tokenError!!
        };
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}
