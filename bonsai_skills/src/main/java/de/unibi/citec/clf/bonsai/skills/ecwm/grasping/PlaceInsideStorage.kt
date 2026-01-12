package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import de.unibi.citec.clf.btl.data.ecwm.StorageArea
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.units.LengthUnit
import java.util.concurrent.Future
import kotlin.math.max

/**
 * Place the Entity anywhere inside the Storage. (Prefers Center)
 *
 * TODO: currently samples gripper target poses inside the storage, set min_z/max_z depending on task
 *
 * The Place Task will sample goal positions starting from the center of the area
 *
 * <pre>
 * Options:
 *  upright:        [Boolean] (Default: false)
 *      -> keep the object upright during movement
 *  flip:           [Boolean] (Default: false)
 *      -> place the object upside down
 *  useSpirit:      [Boolean] (Default: false)
 *      -> use Spirit slot to read entity and storage
 *  maxSize:        [Double] (Default 0.25)
 *      -> maximum size of the target sampling area (if storage is bigger)
 *  padding         [Double] (default 0.04)
 *      -> padding for target sampling (avoids placing at the edges)
 *
 * Slots:
 *  GraspEntity: [Entity] (Read)
 *      -> the entity to be placed. Must be previously attached to gripper.
 *  Spirit: [Spirit] (Optional, Read)
 *      -> only if 'useSpirit' is true
 *  Storage [StorageArea] (Optional, Read)
 *      -> Placing Area, if !'useSpirit'
 *  Entity [Entity] (Optional, Read)
 *      -> Entity to place into, if !'useSpirit'
 *
 * ExitTokens:
 *  success:                    placing was successfully
 *  error.no_plan:              motion planning failed
 *  error.other:                other error while placing
 *
 * Actuator:
 *  ECWMGrasping: [de.unibi.citec.clf.bonsai.actuators.ECWMGrasping]
 *
 * </pre>
 *
 * @author lruegeme
 */
class PlaceInsideStorage : AbstractSkill() {
    private var lum = LengthUnit.METER

    companion object {
        private val KEY_USE_SPIRIT = "use_spirit"
        private val KEY_UPRIGHT = "upright"
        private val KEY_FLIP = "flip"
        private val KEY_TOPDOWN = "topdown"
        private val KEY_MAX_SIZE = "maxSize"
        private val KEY_PADDING = "padding"
        private val KEY_OVERWRITE_Z_MIN = "min_z"
        private val KEY_OVERWRITE_Z_MAX = "max_z"
    }

    //defaults
    private var useSpirit = false
    private var upright = false
    private var flip = false
    private var topdown = false

    // padding for target storage
    private var padding = 0.04f
    // max size of target area
    private var maxSize = 0.25f

    // old values as default (TODO should be double.nan)
    private var minZ = 0.02
    private var maxZ = 0.06

    private var entitySlot: MemorySlotReader<Entity>? = null
    private var spiritSlot: MemorySlotReader<Spirit>? = null
    private var storageAreaSlot: MemorySlotReader<StorageArea>? = null
    private var targetEntitySlot: MemorySlotReader<Entity>? = null

    private var fur: Future<ManipulationActuator.MoveitResult?>? = null
    private var ecwm: ECWMGrasping? = null
    private var ecwmSpirit: ECWMSpirit? = null

    private var tokenSuccess: ExitToken? = null
    private var tokenErrorNoPlan: ExitToken? = null
    private var tokenErrorOther: ExitToken? = null

    private var graspEntity: Entity? = null
    private var targetStorageArea: StorageArea? = null
    private var targetPose = Pose3D()

    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenErrorNoPlan = configurator.requestExitToken(ExitStatus.ERROR().ps("no_plan"))
        tokenErrorOther = configurator.requestExitToken(ExitStatus.ERROR().ps("other"))

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        entitySlot = configurator.getReadSlot("GraspedEntity", Entity::class.java)
        useSpirit = configurator.requestOptionalBool(KEY_USE_SPIRIT, useSpirit)
        if (useSpirit) {
            spiritSlot = configurator.getReadSlot("Spirit", Spirit::class.java)
            ecwmSpirit = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)
        } else {
            storageAreaSlot =  configurator.getReadSlot("Storage", StorageArea::class.java)
            targetEntitySlot =  configurator.getReadSlot("Entity", Entity::class.java)
        }

        padding = configurator.requestOptionalDouble(KEY_PADDING,padding.toDouble()).toFloat()
        maxSize = configurator.requestOptionalDouble(KEY_MAX_SIZE,maxSize.toDouble()).toFloat()

        minZ = configurator.requestOptionalDouble(KEY_OVERWRITE_Z_MIN, minZ)
        maxZ = configurator.requestOptionalDouble(KEY_OVERWRITE_Z_MAX, maxZ)

        flip = configurator.requestOptionalBool(KEY_FLIP,flip)
        topdown = configurator.requestOptionalBool(KEY_TOPDOWN,topdown)
        upright = configurator.requestOptionalBool(KEY_UPRIGHT, upright)
        if(flip && upright) throw ConfigurationException("cant flip and upright at the same time")
    }

    override fun init(): Boolean {
        graspEntity = entitySlot?.recall<Entity>() ?: run {
            logger.error("no entity. Placing needs entity to determine grasp type")
            return false
        }

        if (useSpirit) {
            if(!storageFromSpirit()) {
                logger.error("could not get target by spirit.")
                return false
            }
        } else {
            targetStorageArea = storageAreaSlot?.recall<StorageArea>() ?: run {
                logger.error("storage is null")
                return false;
            }
            val entity = targetEntitySlot?.recall<Entity>() ?: run {
                logger.error("entity is null")
                return false
            }
            targetPose.frameId = "${entity.id}/${targetStorageArea!!.name}"
        }

        logger.info("place object @ $targetPose")
        val (minDist, maxDist) = getMinMaxDist(targetStorageArea!!)

        fur = ecwm?.placeEntity(graspEntity, targetPose, flip, minDist, maxDist, upright = upright, topdown = topdown)

        return fur != null
    }

    private fun storageFromSpirit(): Boolean {
        val spirit = spiritSlot?.recall<Spirit>() ?: run {
            logger.error("cant fetch spirit")
            return false
        }
        targetPose.frameId = "${spirit.entity.id}/${spirit.storage}"
        targetStorageArea = ecwmSpirit?.fetchEntityStorages(spirit.entity)?.get()?.firstOrNull { it.name == spirit.storage } ?: run {
            logger.error("could not find storage: '${spirit.storage}' of entity '${spirit.entity.id}'")
            return false
        }

        return true
    }

    private fun getMinMaxDist(storageArea: StorageArea): Pair<Point3D, Point3D> {
        if (storageArea.sizeX < 2*padding || storageArea.sizeY < 2*padding ) throw Exception("Storage to small for padding($padding): $storageArea")

        // Decrease size if area is too large
        var xStorage = minOf((storageArea.sizeX / 2).toFloat() - padding,maxSize)
        var yStorage = minOf((storageArea.sizeY / 2).toFloat() - padding,maxSize)
        var zStorage = (storageArea.sizeZ)


        if (minZ.isNaN()) minZ = 0.0
        if (maxZ.isNaN()) maxZ = zStorage

        val minDist = Point3D(-xStorage, -yStorage, minZ.toFloat())
        val maxDist = Point3D(xStorage, yStorage, maxZ.toFloat())
        logger.debug("min place: $minDist")
        logger.debug("max place: $maxDist")
        return Pair(minDist, maxDist)
    }

    override fun execute(): ExitToken {

        while (!fur!!.isDone) {
            return ExitToken.loop()
        }

        return when (fur!!.get()) {
            ManipulationActuator.MoveitResult.SUCCESS -> tokenSuccess!!
            ManipulationActuator.MoveitResult.FAILURE -> ExitToken.fatal()
            ManipulationActuator.MoveitResult.PLANNING_FAILED -> tokenErrorNoPlan!!
            ManipulationActuator.MoveitResult.CONTROL_FAILED -> ExitToken.fatal()
            null -> ExitToken.fatal()
            else -> tokenErrorOther!!
        }
    }

    override fun end(curToken: ExitToken): ExitToken {
        if(curToken.exitStatus.isFatal) fur?.cancel(true)
        return curToken
    }
}