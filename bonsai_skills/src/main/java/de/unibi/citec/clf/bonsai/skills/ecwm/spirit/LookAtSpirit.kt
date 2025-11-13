package de.unibi.citec.clf.bonsai.skills.ecwm.spirit

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.actuators.GazeActuator
import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import de.unibi.citec.clf.btl.data.ecwm.SpiritGoal
import de.unibi.citec.clf.btl.data.ecwm.StorageArea
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.data.geometry.Pose2D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future

/**
 * @author lruegeme
 *
 * Assumes the target pose of the current location inside a spirit.
 *
 * Requires to be inside the spirit unless "#_ALWAYS" is set.
 * Mind that the resulting pose may be wrong as only the gaze target is used. (see #_FALLBACK_Z)
 *
 * <pre>
 *
 * Options:
 *  #_ALWAYS:               [Boolean] Optional (Default: false)
 *                              -> Look at Target even if outside spirit area.
 *  #_FALLBACK_Z            []
 *  #_FALLBACK_STORAGE      []
 *  #_Z_OFFSET              []
 *  #_TIMEOUT               []
 *  #_TIMEOUT_Z             []
 *
 * Slots:
 *  Spirit                  [Spirit]
 *                              -> The Spirit
 *
 * ExitTokens:
 *  success:        Spirit exists
 *
 * </pre>
 *
 */

class LookAtSpirit : AbstractSkill() {
    companion object {
        private const val TIAGO_CAM_MIN = 1.2f
        private const val KEY_FALLBACK_LIFT_HEIGHT = "#_FALLBACK_Z"
        private const val KEY_FALLBACK_STORAGE = "#_FALLBACK_STORAGE"
        private const val KEY_HANDLE_ERROR = "#_ALWAYS"
        private const val KEY_Z_OFFSET = "#_Z_OFFSET"
        private const val KEY_TIMEOUT = "#_TIMEOUT"
        private const val KEY_TIMEOUT_Z = "#_TIMEOUT_Z"
    }

    private var timeout: Long = 0
    private var gazeTimeout: Long = 1500
    private var timeoutZ: Long = 8000
    private val minGazeDuration = 250
    private val maxGazeSpeed = 1.5
    private val maxLiftSpeed = 0.7
    private var fallbackStorage = ""
    private var fallbackZ = TIAGO_CAM_MIN + 0.2
    private var zOffset = 0.0;
    private var always = false

    private var point: Point3DStamped? = null
    private var gazeDone: Future<Void>? = null
    private var zliftDone: Future<Boolean>? = null
    private var tokenSuccess: ExitToken? = null
    private var tokenTimeout: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var spirit: MemorySlotReader<Spirit>? = null

    private var gazeActuator: GazeActuator? = null
    private var jointcontroller: JointControllerActuator? = null



    private var ecwm: ECWMSpirit? = null

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        spirit = configurator.getReadSlot("Spirit", Spirit::class.java)
        gazeTimeout = configurator.requestOptionalInt(KEY_TIMEOUT,timeout.toInt()).toLong()
        timeoutZ = configurator.requestOptionalInt(KEY_TIMEOUT_Z, timeoutZ.toInt()).toLong()
        if (gazeTimeout > 0 ) {
            tokenTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"))
        }

        always = configurator.requestOptionalBool(KEY_HANDLE_ERROR, always)
        if (always) {
            tokenError = configurator.requestExitToken(ExitStatus.ERROR().ps("handled"))
            fallbackStorage = configurator.requestOptionalValue(KEY_FALLBACK_STORAGE,fallbackStorage)
            fallbackZ = configurator.requestOptionalDouble(KEY_FALLBACK_LIFT_HEIGHT, fallbackZ)
        }

        zOffset = configurator.requestOptionalDouble(KEY_Z_OFFSET, zOffset)

        jointcontroller = configurator.getActuator("ZLiftActuator", JointControllerActuator::class.java)
        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator::class.java)
        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)
    }

    override fun init(): Boolean {
        val spirit = spirit?.recall<Spirit>() ?: run {
            logger.error("spirit is null")
            return false
        }

        val goal = try {
            ecwm!!.getSpiritGoalCurrent(spirit).get()!!
        } catch (e: Exception) {

            if(!always) {
                logger.error("could not get goal for current position")
                return false
            }

            logger.info("could not get a spirit goal, just looking at entity/storage")
            // we return error.handled
            tokenSuccess = tokenError
            val pose = Pose3D().apply {
                frameId = if(fallbackStorage.isNotEmpty()) {
                    "${spirit.entity.id}/${fallbackStorage}"
                } else {
                    if(spirit.storage.isEmpty()) spirit.entity.id else "${spirit.entity.id}/${spirit.storage}"
                }

            }
            SpiritGoal(fallbackZ, pose, Pose2D())

        }

        logger.debug(
            """view target: ${goal.viewTarget.translation.getX(LengthUnit.METER)}, 
                ${goal.viewTarget.translation.getY(LengthUnit.METER)}, 
                ${goal.viewTarget.translation.getZ(LengthUnit.METER)} (${goal.viewTarget.frameId})    
            """.trimIndent()
        )
        logger.debug("zlift target: ${goal.camHeight}")
        point = Point3DStamped(goal.viewTarget.translation,  goal.viewTarget.frameId)
        point?.setZ(point!!.getZ(LengthUnit.METER) + zOffset,LengthUnit.METER)
        zliftDone = jointcontroller?.moveTo(goal.camHeight.toFloat() - TIAGO_CAM_MIN, maxLiftSpeed)

        if (timeoutZ > 0) {
            logger.debug("using timeoutZ of $timeoutZ ms")
            timeoutZ += Time.currentTimeMillis()
        }

        return zliftDone != null


    }

    override fun execute(): ExitToken {

        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("timeout")
                return tokenTimeout!!
            }
        }
        
        if(! zliftDone!!.isDone) {
            if(gazeDone == null && Time.currentTimeMillis() > timeoutZ) {
                logger.info("reached timeoutZ at $timeoutZ without zlift done, forcing gaze start")
            } else {
                return ExitToken.loop()
            }

        }

        if(gazeDone == null) {
            logger.debug("setting gaze...")
            gazeDone = gazeActuator!!.lookAt(point!!, maxGazeSpeed, minGazeDuration.toLong())
            if (gazeTimeout > 0) timeout = Time.currentTimeMillis() + gazeTimeout
            if (gazeDone == null) return ExitToken.fatal()
        }
        
        if (!gazeDone!!.isDone ) {
            return ExitToken.loop()
        }

        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }


}

