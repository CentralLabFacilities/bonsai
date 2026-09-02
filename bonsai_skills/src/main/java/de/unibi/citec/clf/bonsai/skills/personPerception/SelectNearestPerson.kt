package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.units.LengthUnit

/**
 * Identifies the nearest person from a list of persons and saves it to memory.
 *
 * <pre>
 *
 * Options:
 *  #_MAX_DIST:              [double] Optional (Default: Double.MAX_VALUE)
 *                              -> Maximum distance in mm within which a person
 *                                 is considered as a candidate.
 *
 * Slots:
 *  PersonDataListSlot:      [PersonDataList] [Read]
 *                              -> List of detected persons from which the nearest
 *                                 person is selected.
 *
 *  PositionDataSlot:        [Pose2D] [Read]
 *                              -> Current robot position used to calculate the
 *                                 distance to each person.
 *
 *  PersonDataSlot:          [PersonData] [Write]
 *                              -> Memory slot in which the nearest person is stored.
 *
 * ExitTokens:
 *  success:                 The nearest person was found and written to memory.
 *  error:                   No person was within the configured maximum distance.
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
class SelectNearestPerson : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var personDataListSlot: MemorySlotReader<PersonDataList>? = null
    private var pose2DSlot: MemorySlotReader<Pose2D>? = null
    private var personDataSlot: MemorySlotWriter<PersonData>? = null
    private var personDataList: PersonDataList? = null
    private var pose2D: Pose2D? = null
    private var bestPerson: PersonData? = null

    private var maxDist = Double.MAX_VALUE

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())
        personDataListSlot = configurator.getReadSlot("PersonDataListSlot", PersonDataList::class.java)
        pose2DSlot = configurator.getReadSlot("PositionDataSlot", Pose2D::class.java)
        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData::class.java)

        maxDist = configurator.requestOptionalDouble(KEY_MAX_DIST, maxDist)
    }

    override fun init(): Boolean {
            personDataList = personDataListSlot?.recall<PersonDataList>() ?: return false
            if (personDataList?.isEmpty()!!) {
                logger.error("your PersonDataListSlot was empty")
                return false
            }

            pose2D = pose2DSlot?.recall<Pose2D>() ?: return false

            if (java.lang.Double.isNaN(pose2D!!.getX(LengthUnit.METER)) || java.lang.Double.isNaN(pose2D!!.getY(LengthUnit.METER))) {
                logger.error("your PositionDataSlot was NaN")
                return false
            }

        return true
    }

    override fun execute(): ExitToken {
        var bestDist = maxDist
        bestPerson = null
        for (currentPerson in personDataList!!) {
            val distance: Double = pose2D!!.getDistance(currentPerson.position, LengthUnit.MILLIMETER)
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
