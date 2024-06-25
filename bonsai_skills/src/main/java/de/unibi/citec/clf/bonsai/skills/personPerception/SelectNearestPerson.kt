package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.navigation.PositionData
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.units.LengthUnit

/**
 * Identifies the nearest person from a list of persons and saves it to memory.
 *
 * <pre>
 *
 * Slots:
 * PersonDataListSlot:             [PersonDataList] [Read]
 * -> All found persons in a list
 * PositionSlot:                   [Position] [Read]
 * -> the robot position to calculate relative distance.
 * PersonDataSlot:             [PersonData] [Write]
 * -> The nearest person
 *
 * ExitTokens:
 * success:         The nearest Person has been written to memory.
 * error:           The nearest Person has not been written to memory.
 *
</pre> *
 *
 * @author pvonneumanncosel
 */
class SelectNearestPerson : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var personDataListSlot: MemorySlotReader<PersonDataList>? = null
    private var positionDataSlot: MemorySlotReader<PositionData>? = null
    private var personDataSlot: MemorySlotWriter<PersonData>? = null
    private var personDataList: PersonDataList? = null
    private var positionData: PositionData? = null
    private var bestPerson: PersonData? = null

    private var maxDist = Double.MAX_VALUE

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())
        personDataListSlot = configurator.getReadSlot("PersonDataListSlot", PersonDataList::class.java)
        positionDataSlot = configurator.getReadSlot("PositionDataSlot", PositionData::class.java)
        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData::class.java)

        maxDist = configurator.requestOptionalDouble(KEY_MAX_DIST, maxDist)
    }

    override fun init(): Boolean {
            personDataList = personDataListSlot?.recall<PersonDataList>() ?: return false
            if (personDataList?.isEmpty()!!) {
                logger.error("your PersonDataListSlot was empty")
                return false
            }

            positionData = positionDataSlot?.recall<PositionData>() ?: return false

            if (java.lang.Double.isNaN(positionData!!.getX(LengthUnit.METER)) || java.lang.Double.isNaN(positionData!!.getY(LengthUnit.METER))) {
                logger.error("your PositionDataSlot was NaN")
                return false
            }

        return true
    }

    override fun execute(): ExitToken {
        var bestDist = maxDist
        bestPerson = null
        for (currentPerson in personDataList!!) {
            val distance: Double = positionData!!.getDistance(currentPerson.position, LengthUnit.MILLIMETER)
            logger.debug("person is $distance away")
            if (distance < bestDist) {
                bestDist = distance
                bestPerson = currentPerson
                logger.debug("person is closer!")
            }

        }
        return if (bestPerson == null) {
            tokenError!!
        } else tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        if (curToken.exitStatus.isSuccess) {
            if (bestPerson != null) {
                personDataSlot?.memorize<PersonData>(bestPerson)
            }
        }
        return curToken
    }

    companion object {
        private const val KEY_MAX_DIST = "#_MAX_DIST"
    }
}
