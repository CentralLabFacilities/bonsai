package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import java.io.IOException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import kotlin.math.abs

/**
 * <p>
 * Look for all visible persons and save them (including poses & gestures) to a personDataSlot.
 * If there are no current visible persons the skill will loop until timeout has been reached.
 * Search can be narrowed down by specifying max angle and distance to the person.
 * </p>
 *
 * <pre>
 *
 * Options:
 *  #_MAX_DISTANCE:                 [Double] Optional (Default: 3)
 *                                      -> Maximum person distance in meter
 *  #_MAX_ANGLE                     [Double] Optional (Default: PI/2)
 *                                      -> Maximum person angle (to both sides relative to the direction of view of the
 *                                         robot) in rad
 *  #_TIMEOUT                       [Long] Optional (Default: -1)
 *                                      -> Maximum amount of time the robot searches for a person in ms
 *  #_ACTUATOR_TIMEOUT              [Long] Optional (Default: 20000)
 *                                      -> Maximum amount of time for a single actuator call in ms
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Write]
 *                                      -> All found persons in a list
 *
 * ExitTokens:
 *  success:                There has been at least one person perceived in the given timeout interval satisfying the
 *                          optional given angle and distance parameters.
 *  error.noPeople:         There has been no person perceived in the given timeout interval satisfying the optional
 *                          given angle and distance parameters
 *  error.timeout:          The time limit has been reached when reading values from actuators
 *
 * Sensors:
 *  PositionSensor: [Pose2D]
 *      -> Used to read the current robot position
 *
 * Actuators:
 *  PeopleActuator: [DetectPeopleActuator]
 *      -> Used to detect people
 *
 * </pre>
 *
 * @author nschmitz
 */
class SearchPeopleWithPoses : AbstractSkill() {

    private var tokenErrorNoPeople: ExitToken? = null
    private var tokenSuccessPeople: ExitToken? = null
    private var tokenErrorTimeout: ExitToken? = null

    private var searchDistance = 3.0
    private var searchAngle = Math.PI / 2
    private var searchTimeout = -1L
    private var actuatorTimeout = 20000L

    private var positionSensor: Sensor<Pose2D>? = null
    private var peopleActuator: DetectPeopleActuator? = null
    private var personDataListSlot: MemorySlotWriter<PersonDataList>? = null

    private var robotPosition = Pose2D()
    private lateinit var peopleFuture: Future<PersonDataList>
    private var unfilteredDetectedPersons = PersonDataList()
    private var filteredDetectedPersons = PersonDataList()

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessPeople = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
        tokenErrorNoPeople = configurator.requestExitToken(ExitStatus.ERROR().ps("noPeople"))

        searchDistance = configurator.requestOptionalDouble(KEY_DISTANCE, searchDistance)
        searchAngle = configurator.requestOptionalDouble(KEY_ANGLE, searchAngle)
        searchTimeout = configurator.requestOptionalInt(KEY_TIMEOUT, searchTimeout.toInt()).toLong()
        actuatorTimeout = configurator.requestOptionalInt(KEY_ACTUATOR_TIMEOUT, actuatorTimeout.toInt()).toLong()

        personDataListSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList::class.java)
        peopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator::class.java)
        positionSensor = configurator.getSensor("PositionSensor", Pose2D::class.java)
    }

    override fun init(): Boolean {
        logger.debug("Settings: [SearchDist: $searchDistance m; SearchAngle: $searchAngle rad]")
        if (searchTimeout > 0) {
            logger.debug("Using timeout of $searchTimeout ms")
            searchTimeout += Time.currentTimeMillis()
        }
        try {
            robotPosition = positionSensor!!.readLast(200)
        } catch (e: Exception) {
            when (e) {
                is IOException, is InterruptedException -> {
                    logger.error("Could not read robot position")
                    return false
                }

                else -> throw (e)
            }
        }
        try {
            peopleFuture = peopleActuator!!.getPeople()
            actuatorTimeout += Time.currentTimeMillis()
        } catch (e: Exception) {
            when (e) {
                is InterruptedException, is ExecutionException -> {
                    logger.error(e)
                    return false
                }

                else -> throw (e)
            }
        }
        return true

    }

    override fun execute(): ExitToken {
        if (searchTimeout > 0) {
            if (Time.currentTimeMillis() > searchTimeout) {
                logger.info("Searching for persons reached timeout")
                return tokenErrorNoPeople!!
            }
        }
        if (!peopleFuture.isDone) {
            return if (actuatorTimeout < Time.currentTimeMillis()) {
                tokenErrorTimeout!!
            } else {
                ExitToken.loop(50)
            }
        }
        try {
            unfilteredDetectedPersons = peopleFuture.get()
        } catch (e: Exception) {
            when (e) {
                is InterruptedException, is ExecutionException -> {
                    logger.error("Can't access people actuator")
                    return ExitToken.fatal()
                }

                else -> throw (e)
            }
        }
        if (unfilteredDetectedPersons.isEmpty()) {
            logger.info("No person detected")
            return tokenErrorNoPeople!!
        }
        unfilteredDetectedPersons.forEach { detectedPerson ->
            val localPos = detectedPerson.position
            val globalPos =
                if (detectedPerson.position.isInBaseFrame) CoordinateSystemConverter.localToGlobal(
                    detectedPerson.position,
                    robotPosition
                ) else detectedPerson.position
            val localAsPolar = PolarCoordinate(localPos)
            val angle = localAsPolar.getAngle(ANGLE_UNIT)
            val distance = localAsPolar.getDistance(LENGTH_UNIT)
            logger.debug("Distance of person to robot is $distance m at an angle of $angle rad")
            if (abs(angle) > searchAngle) {
                logger.debug("Relative angle of person to robot is $angle, threshold is $searchAngle. Skipping person")
                return@forEach
            }
            if (distance > searchDistance) {
                logger.debug("Distance of person to robot is $distance, threshold is $searchDistance. Skipping person")
                return@forEach
            }
            logger.info("Found person at distance $distance m at angle ${Math.toDegrees(angle)} degree")
            detectedPerson.position = globalPos
            filteredDetectedPersons.add(detectedPerson)
        }
        return if (filteredDetectedPersons.isEmpty()) tokenErrorNoPeople!! else tokenSuccessPeople!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        if (curToken.exitStatus.isSuccess) {
            if (filteredDetectedPersons.isNotEmpty()) {
                try {
                    personDataListSlot?.memorize(filteredDetectedPersons)
                } catch (e: CommunicationException) {
                    logger.fatal("Unable to write to memory: ${e.message}")
                    return ExitToken.fatal()
                }
            }
        }
        return curToken
    }

    companion object {
        private const val KEY_DISTANCE = "#_MAX_DIST"
        private const val KEY_ANGLE = "#_MAX_ANGLE"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_ACTUATOR_TIMEOUT = "#_ACTUATOR_TIMEOUT"
        private val LENGTH_UNIT = LengthUnit.METER
        private val ANGLE_UNIT = AngleUnit.RADIAN
    }
}