package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.btl.List
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.data.person.PersonDataList
import java.io.IOException

/**
 * <p>
 * Gets all persons currently detected by the robot from the sensor.
 * </p>
 *
 * <pre>
 *
 * Slots:
 * PersonDataListSlot:     [PersonDataList] [Write]
 * -> Saves the current people to this slot
 *
 * ExitTokens:
 * success:                Persons have been retrieved successfully
 *
 * </pre>
 *
 * @author  lruegeme
 */
class GetPeople : AbstractSkill() {
    // used tokens
    private var tokenSuccess: ExitToken? = null

    private var personSensor: Sensor<PersonDataList>? = null

    private var currentPersonSlot: MemorySlotWriter<PersonDataList?>? = null


    lateinit var persons: List<PersonData>
    private var positionSensor: Sensor<Pose2D?>? = null
    private var robotPosition: Pose2D? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        positionSensor = configurator.getSensor("PositionSensor", Pose2D::class.java)
        personSensor = configurator.getSensor("PersonSensor", PersonDataList::class.java)
        currentPersonSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList::class.java)
    }

    override fun init(): Boolean {
        return true
    }

    override fun execute(): ExitToken? {
        try {
            persons = personSensor!!.readLast(200)
            robotPosition = positionSensor!!.readLast(200)
        } catch (ex: IOException) {
            logger.error("Exception while retrieving stuff", ex)
            return ExitToken.fatal()
        } catch (ex: InterruptedException) {
            logger.error("Exception while retrieving stuff", ex)
            return ExitToken.fatal()
        }

        logger.debug("Retrieved ${persons.size} persons from sensor")

        if (!persons.isEmpty() && !persons[0].isInBaseFrame) {
            for (p in persons) {
                p.position = getLocalPosition(p.position)
            }
        }

        val list = PersonDataList(persons)

        try {
            currentPersonSlot?.memorize(list)
            return tokenSuccess
        } catch (ex: CommunicationException) {
            logger.fatal("Exception while storing current people in memory!", ex)
            return ExitToken.fatal()
        }
    }

    private fun getLocalPosition(position: Pose2D): Pose2D {
        return if (position.getFrameId() == Pose2D.ReferenceFrame.LOCAL.frameName) {
            position
        } else {
            CoordinateSystemConverter.globalToLocal(position, robotPosition)
        }
    }

    override fun end(curToken: ExitToken?): ExitToken? {
        return curToken
    }
}
