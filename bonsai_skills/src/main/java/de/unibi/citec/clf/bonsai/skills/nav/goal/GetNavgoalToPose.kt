package de.unibi.citec.clf.bonsai.skills.nav.goal

import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.core.`object`.Sensor
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData
import de.unibi.citec.clf.btl.units.AngleUnit
import de.unibi.citec.clf.btl.units.LengthUnit

/**
 * Generates a NavGoal on a straight line to a position.
 *
 * Options:
 *
 * #_TARGET_DIST:   [Double] Optional (default: 1.0)
 *                      -> Distance of generated navigation goal to target
 * #_MAX_DIST:      [Double] Optional (default #_TARGET_DIST)
 *                      -> Max Distance to finish with already_there
 *
 * Slots:
 *  Pose: [Pose3D] [Read]
 *      -> The Pose3D to which a NavGoal should be generated
 *  NavigationGoalData [NavigationGoalData] [Write]
 *      -> The resulting NavGoal
 *
 * ExitTokens:
 * success.need_move:      Successfully generated a NavGoal
 * success.already_there:  Successfully generated a NavGoal, but robot is close enough
 * fatal:                  Could not read or write to slot
 *
 * @author lruegeme
 * </pre>
 */

class GetNavgoalToPose : AbstractSkill() {

    companion object {
        private const val TARGET_DIST = "#_TARGET_DIST"
        private const val KEY_MAX_DIST = "#_MAX_DIST"
    }

    private var robotPositionSensor: Sensor<Pose2D>? = null
    private var lum = LengthUnit.METER

    private var tokenSuccessNM: ExitToken? = null
    private var tokenSuccessAT: ExitToken? = null
    private var tokenError: ExitToken? = null
    private var poseReader: MemorySlotReader<Pose3D?>? = null
    private var goalSlot: MemorySlotWriter<NavigationGoalData?>? = null
    private var pose: Pose3D? = null
    private var coordTransformer: CoordinateTransformer? = null


    private var targetDistance = 1.0
    private var maxDistance = targetDistance
    private var robot : Pose2D? = null

    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessNM = configurator.requestExitToken(ExitStatus.SUCCESS().ps("need_move"))
        tokenSuccessAT = configurator.requestExitToken(ExitStatus.SUCCESS().ps("already_there"))

        targetDistance = configurator.requestOptionalDouble("target_distance", targetDistance)

        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        poseReader = configurator.getReadSlot("Pose", Pose3D::class.java)
        goalSlot = configurator.getWriteSlot("NavigationGoalData", NavigationGoalData::class.java)

        robotPositionSensor = configurator.getSensor<Pose2D>("PositionSensor", Pose2D::class.java)

        targetDistance = configurator.requestOptionalDouble(TARGET_DIST, targetDistance)
        maxDistance = configurator.requestOptionalDouble(KEY_MAX_DIST, targetDistance)

        if (configurator.getTransform() != null)
            coordTransformer = configurator.getTransform() as CoordinateTransformer
    }

    override fun init(): Boolean {
        robot = robotPositionSensor?.readLast(500) ?: run { return false }

        pose = poseReader?.recall<Pose3D>() ?: run {
            logger.error("Could not recall from Pose3D slot")
            return false
        }

        logger.info("targetDistance:$targetDistance maxDistance:$maxDistance")
        return true
    }

    override fun execute(): ExitToken {

        // Convert pos to base_link
        val localPosition1: Pose2D =
            try {
                val entityLocal: Pose3D = coordTransformer!!.transform(pose!!, "base_link")
                val localPosition = Pose2D()
                localPosition.setX(entityLocal.translation.getX(LengthUnit.METER), LengthUnit.METER)
                localPosition.setY(entityLocal.translation.getY(LengthUnit.METER), LengthUnit.METER)
                localPosition.setFrameId(entityLocal.frameId)
                localPosition.setYaw(entityLocal.rotation.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN)
                localPosition
            } catch (e: Exception) {
                var targetPosition = Point3DStamped(pose!!.translation, pose!!.frameId)
                if (targetPosition.frameId.isEmpty()) {
                    targetPosition.frameId = "map"
                    logger.info("no frame ID for pose, will use map")
                }
                if (targetPosition.frameId != "map") {
                    logger.error("could not convert entity frameid (${targetPosition.frameId} to map")
                    return tokenError!!
                }
                var pos = robotPositionSensor?.readLast(200) ?: return ExitToken.fatal()
                logger.debug("robot: $pos")
                logger.debug("goal: $targetPosition")
                val position = Pose2D(
                    targetPosition.getX(LengthUnit.METER),
                    targetPosition.getY(LengthUnit.METER),
                    0.0,
                    LengthUnit.METER,
                    AngleUnit.RADIAN,
                ).apply {
                    setFrameId(Pose2D.ReferenceFrame.GLOBAL)
                }
                CoordinateSystemConverter.globalToLocal(position, pos)
            }


        logger.info("local entity position: $localPosition1")

        val polar = PolarCoordinate(localPosition1)
        val d = polar.getDistance(lum)
        logger.info("distance to entity is $d meter")
        if (d < maxDistance)
            return tokenSuccessAT!!

        polar.setDistance(d - targetDistance, lum)
        logger.info("polar target: $polar")
        val goal = CoordinateSystemConverter.polar2NavigationGoalData(robot, polar.getAngle(AngleUnit.RADIAN), polar.getDistance(lum), AngleUnit.RADIAN, lum)
        logger.info("goal is: $goal")

        goalSlot!!.memorize(goal)

        return tokenSuccessNM!!
    }

    override fun end(exitToken: ExitToken): ExitToken {
        return exitToken
    }
}