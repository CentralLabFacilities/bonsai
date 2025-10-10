package de.unibi.citec.clf.bonsai.skills.ecwm.util

import de.unibi.citec.clf.bonsai.actuators.GazeActuator
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.time.Time
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future

/**
 * Lifts torso and points camera at an Entity
 * Designed for objects, use Spirit Goals for everything else
 *
 * <pre>
 *
 * Slots:
 *  Entity: [Entity] [Read]
 *      -> The view target
 *
 * ExitTokens:
 * success:           Aligned camera to Entity
 * success.timeout:   Head may not be turned
 *
 * @author lruegeme, lgraesner
 * </pre>
 */

class LookAtEntity : AbstractSkill() {

    private val KEY_TIMEOUT = "#_TIMEOUT"
    private val KEY_MIN_DURATION = "#_MIN_DURATION"
    private val KEY_MAX_SPEED = "#_MAX_SPEED"
    private val KEY_OFFSET = "#_OFFSET"

    private var timeout: Long = -1
    private var zOffset = 0.0

    private var gazeDone: Future<Void>? = null

    private var tokenSuccess: ExitToken? = null
    private var tokenTimeout: ExitToken? = null

    private var entitySlot: MemorySlotReader<Entity>? = null

    private var gazeActuator: GazeActuator? = null

    private var min_duration = 500L
    private var max_speed = 1.0


    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        entitySlot = configurator.getReadSlot("Entity", Entity::class.java)
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT,timeout.toInt()).toLong()
        if (timeout > 0) {
            tokenTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"))
        }

        min_duration = configurator.requestOptionalInt(KEY_MIN_DURATION, min_duration.toInt()).toLong()
        max_speed = configurator.requestOptionalDouble(KEY_MAX_SPEED, max_speed)
        zOffset = configurator.requestOptionalDouble(KEY_OFFSET,zOffset)

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator::class.java)
    }

    override fun init(): Boolean {
        val entity = entitySlot?.recall<Entity>() ?: run {
            logger.fatal("entity from slot is null")
            return false
        }

        logger.debug("entity: $entity")

        val target_point = Point3DStamped(entity.pose?.translation, entity.frameId).apply {
            setZ(zOffset + getZ(LengthUnit.METER), LengthUnit.METER)
        } ?: return false

        if (timeout > 0) {
            logger.debug("using timeout of $timeout ms, half for zlift")
            timeout +=  Time.currentTimeMillis()
        }

        logger.info("look at: $target_point")
        gazeDone = gazeActuator!!.lookAt(target_point, max_speed, min_duration)

        return true

    }

    override fun execute(): ExitToken {

        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("timeout")
                return tokenTimeout!!
            }
        }

        if(gazeDone == null) {
            logger.debug("setting gaze...")

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

