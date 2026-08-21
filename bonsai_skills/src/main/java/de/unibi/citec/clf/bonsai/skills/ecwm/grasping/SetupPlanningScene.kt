package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.units.LengthUnit

import java.util.concurrent.Future
/**
 * Setup the planning scene by adding Entities known to the World Model
 *
 * <pre>
 *
 * Options:
 *  clear:              [boolean] Optional (Default: true)
 *                      -> Clear the planning scene before adding entities.
 *
 *  clear_attached:     [boolean] Optional (Default: false)
 *                      -> Also clear objects attached to the robot.
 *
 *  no_objects:         [boolean] Optional (Default: false)
 *                      -> Do not add graspable objects to the planning scene.
 *
 *  distance:           [double] Optional (Default: 2.0)
 *                      -> Maximum distance from the robot for entities
 *                         to be added to the planning scene.
 *
 *  safety_plane:       [boolean] Optional (Default: false)
 *                      -> If enabled, calculate the height of a safety plane
 *                         using the Spirit slot and coordinate transformation.
 *
 * Slots:
 *  Spirit: [Spirit] [Read]
 *      -> Memory slot containing the current Spirit information.
 *      -> Only required when safety_plane is enabled.
 *      -> The entity and storage information is used to calculate the
 *         height of the safety plane.
 *
 * ExitTokens:
 *  success:            Planning scene successfully set up
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGrasping]
 *      -> Used to configure the planning scene and add nearby entities.
 *
 * </pre>
 *
 * @author lruegeme, jzilke
 */
class SetupPlanningScene : AbstractSkill() {

    private val KEY_CLEAR= "clear"
    private val KEY_CLEARATTACHED= "clear_attached"
    private val KEY_NO_OBJECTS= "no_objects"
    private val KEY_DISTANCE= "distance"
    private val KEY_SAFETY= "safety_plane"

    private var fur: Future<Boolean>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null

    private var spirit: MemorySlotReader<Spirit>? = null

    private var clear = true
    private var clear_attached = false
    private var no_objects = false

    private var distance = 2.0
    private var coordTransformer: CoordinateTransformer? = null



    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)

        clear = configurator.requestOptionalBool(KEY_CLEAR, clear)
        clear_attached = configurator.requestOptionalBool(KEY_CLEARATTACHED, clear_attached)
        distance = configurator.requestOptionalDouble(KEY_DISTANCE,distance)
        no_objects = configurator.requestOptionalBool(KEY_NO_OBJECTS, no_objects)

        if (configurator.requestOptionalBool(KEY_SAFETY, false)) {
            spirit = configurator.getReadSlot("Spirit", Spirit::class.java)
            coordTransformer = configurator.getTransform() as? CoordinateTransformer
        }

    }

    override fun init(): Boolean {
        var height: Float? = null
        if (spirit != null) {
            val s = spirit?.recall<Spirit>() ?: run {
                logger.error("could not read spirit. Needed for $KEY_SAFETY=true")
                return false
            }
            val point = Point3DStamped().apply {frameId = "${s.entity.id}/${s.storage}"}
            val z = coordTransformer?.transform(point, "map")?.getZ(LengthUnit.METER)
            height = z?.toFloat()
            logger.info("spawning plane @${height}m (calculated using ${s.entity.id}/${s.storage}")
        }

        fur = ecwm?.setupPlanningSceneArea(distance.toFloat(),clear,clear_attached, no_objects, safetyHeight = height)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        return if (fur!!.get()) tokenSuccess!! else ExitToken.fatal()
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
