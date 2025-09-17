package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper
import de.unibi.citec.clf.btl.List
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.person.PersonData
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit
import java.io.IOException
import kotlin.math.abs

/**
 * Use this state to wait until a person is recognized in front of the robot.
 * The person should stand in a cone in front of the robot defined by #_MAX_DIST and #_MAX_ANGLE
 * This skill loops till the robot recognized a person in front.
 * <pre>
 *
 * Options:
 *  #_TIMEOUT:          [long] Optional (default: -1)
 *                          -> enable timeout after x ms. -1 means not time out
 * #_MAX_DIST:          [double] Optional (default: 2.0)
 *                          -> max person distance in meter
 * #_MAX_ANGLE:         [double] Optional (default: 0.4)
 *                            -> max Person Angle in radiant(in both directions)
 * #_NAME:              [String] Optional (default: Null)
 *                            -> look for a specific name
 *
 * Slots:
 * PersonDataSlot: [PersonData] [Write]
 *      -> saves the found person to this slot
 *
 * ExitTokens:
 *  success:             -> person found
 *  success.timeout:     -> timeout
 *  fatal:               -> a hard error occurred e.g. Slot communication error
 *
 * Sensors:
 *  PersonSensor: [PersonDataList]
 *      -> Used to detect people
 *  PositionSensor: [Pose2D]
 *      -> Used to read the current robot position
 *
 * </pre>
 *
 *
 *
 * @author lkettenb, lruegeme
 */
class WaitForPerson : AbstractSkill() {
    //defaults
    private var timeout: Long = -1
    private var maxDist = 2.0
    private var maxAngle = 0.4
    private var name : String? = null

    // used tokens
    private var tokenSuccess: ExitToken? = null
    private var tokenTimeout: ExitToken? = null
    private var tokenName: ExitToken? = null

    private var personSensor: Sensor<PersonDataList>? = null
    private var positionSensor: Sensor<Pose2D>? = null
    private var currentPersonSlot: MemorySlotWriter<PersonData>? = null
    var robotPosition: Pose2D? = null
    var personInFront: PersonData? = null
    var persons: List<PersonData>? = null
    var tf: CoordinateTransformer? = null
    override fun configure(configurator: ISkillConfigurator) {
        // odom -> footprint broken?
        tf = configurator.getTransform() as? CoordinateTransformer

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        personSensor = configurator.getSensor("PersonSensor", PersonDataList::class.java)
        positionSensor = configurator.getSensor("PositionSensor", Pose2D::class.java)
        currentPersonSlot = configurator.getWriteSlot("PersonDataSlot", PersonData::class.java)

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout.toInt()).toLong()
        maxDist = configurator.requestOptionalDouble(KEY_DIST, maxDist)
        maxAngle = configurator.requestOptionalDouble(KEY_ANGLE, maxAngle)

        if (timeout > 0) {
            tokenTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
        }

        if (configurator.hasConfigurationKey(KEY_NAME)) {
            tokenName = configurator.requestExitToken(ExitStatus.ERROR().ps("missing"))
            name = configurator.requestValue(KEY_NAME)
        }
    }

    override fun init(): Boolean {
        logger.info("Data in WaitForPerson [timeout= $timeout, maxDist=$maxDist, maxAngle=$maxAngle] ${if (name != null) "name=$name" else ""}")
        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms")
            timeout += Time.currentTimeMillis()
        }
        // Wait for persons in front of sensor
        logger.debug("Waiting for person in front ...")
        return true
    }

    override fun execute(): ExitToken {
        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("WaitForPerson timeout")
                return tokenTimeout!!
            }
        }
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
        if (persons == null) {
            logger.warn("Not read from person sensor.")
            return ExitToken.loop()
        }
        if (name != null) {
            val filtered = persons?.filter { it.name == name || it.uuid == name }
            if (filtered.isNullOrEmpty()) {
                var personsDebug = ""
                personsDebug = persons?.stream()?.map { person: PersonData -> "uuid '${person.uuid}' name: '${person.name}'" }?.reduce(personsDebug) { obj: String, str: String -> obj + str } ?: ""
                logger.info("persons: $personsDebug")
                logger.debug("requested persons name not found.")
                return ExitToken.loop()
            }
            persons?.clear()
            persons?.addAll(filtered)
        }



        if (persons.isNullOrEmpty()) {
            logger.debug("No persons found.")
            return ExitToken.loop()
        }
        if (robotPosition == null) {
            logger.warn("Not read from position sensor.")
            return ExitToken.loop()
        }


        personInFront = null
        var polar: PolarCoordinate
        var personsDebug = ""
        personsDebug = persons?.stream()?.map { person: PersonData -> person.uuid + " " }?.reduce(personsDebug) { obj: String, str: String -> obj + str } ?: ""
        logger.info("persons: $personsDebug")
        if (!persons!!.isEmpty() && !persons?.get(0)!!.isInBaseFrame) {
            for (p in persons!!) {
                p.position = getLocalPosition(p.position)
            }
        }
        PersonHelper.sortPersonsByDistance(persons)
        for (p in persons!!) {
            polar = PolarCoordinate(p.position)
            logger.debug("""
                Person ${p.uuid}(${p.name}) frame person:${p.frameId}
                dist:${polar.getDistance(LengthUnit.METER)}
                angle:${polar.getAngle(AngleUnit.RADIAN)}""")
            // if person too far away
            if (polar.getDistance(LengthUnit.METER) < maxDist
                    && abs(polar.getAngle(AngleUnit.RADIAN)) < maxAngle) {
                logger.info("person is in front!" + p.uuid)
                personInFront = p
                break
            }
        }
        return if (personInFront != null) {
            tokenSuccess!!
        } else {
            ExitToken.loop()
        }
    }

    private fun getLocalPosition(position: Pose2D): Pose2D {
        return if (position.frameId == Pose2D.ReferenceFrame.LOCAL.frameName) {
            position
        } else {
            CoordinateSystemConverter.globalToLocal(position, robotPosition)
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        return if (personInFront != null) {
            try {
                currentPersonSlot?.memorize<PersonData>(personInFront)
                tokenSuccess!!
            } catch (ex: CommunicationException) {
                logger.fatal(
                        "Exception while storing current Person in memory!", ex)
                ExitToken.fatal()
            }
        } else curToken
    }

    companion object {
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_DIST = "#_MAX_DIST"
        private const val KEY_ANGLE = "#_MAX_ANGLE"
        private const val KEY_NAME = "#_NAME"
    }
}
