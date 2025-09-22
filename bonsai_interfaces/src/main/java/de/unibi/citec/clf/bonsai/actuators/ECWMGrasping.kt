package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import de.unibi.citec.clf.btl.data.world.Model
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D
import de.unibi.citec.clf.btl.data.geometry.Point3D
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.units.LengthUnit
import java.io.IOException
import java.util.concurrent.Future

interface ECWMGrasping : Actuator {

    /**
     * Recognizes objects inside an storage location
     * does not ensure we currently look at the location
     *
     * @param entity entity which has the storage
     * @param storage all recognitions outside storage bounds get filtered
     * @param addEntities add all recognized entities to the world model
     */
    @Throws(IOException::class)
    fun recognizeObjects(entity: Entity, storage: String, minProb: Double, fastPose: Boolean = false, addEntities: Boolean = false, clearStorage : Boolean = true, padding : Float = 0.05f): Future<EntityList?>

    /**
     * Recognizes objects in view
     *
     * @param addEntities add all recognized entities to the world model
     */
    @Throws(IOException::class)
    fun recognizeEntities(minProb: Double, fastPose: Boolean = false, addEntities: Boolean = false, safetyHeight : Double = 0.0): Future<EntityList?>

    /**
     * Grasp an ECWM Entity
     *
     * @param upright   try to keep the object upright
     * @param carryPose set the target pose after grasping
     * @param unknownEntity grasp an unknown entity that is not added to the world model
     */
    @Throws(IOException::class)
    fun graspEntity(entity: Entity, upright: Boolean = false, carryPose: String? = null, unknownEntity: Boolean = false, keepScene: Boolean = true): Future<ManipulationActuator.MoveitResult?>

    /**
     * Place an ECWM Entity somewhere inside the target entities storage
     */
    @Throws(IOException::class)
    fun placeEntity(target_entity: Entity, targetStorage: String, attachedEntity: Entity? = null, upright: Boolean = false): Future<ManipulationActuator.MoveitResult?>

    /**
     * Place an ECWM Entity somewhere near the target pose
     */
    @Throws(IOException::class)
    fun placeEntity(attached_entity: Entity?, pose: Pose3D, flip: Boolean, min_dist : Point3D?, max_dist : Point3D?, upright: Boolean = false): Future<ManipulationActuator.MoveitResult?>
    fun placeEntity(attached_entity: Entity?, pose: Pose3D, flip: Boolean, upright: Boolean = false): Future<ManipulationActuator.MoveitResult?>

    /**
     * Wipe an area at the target entity (e.g. table)
     * pose: x and y of pose3d are used to describe relative pose within the target entity
     * area: x describes width, y describes length
     * max_height_distance: is used as height constraint in meters ( while wiping, how far up can the gripper go above the target)
     */
    @Throws(IOException::class)
    fun wipeArea(target_entity: Entity, pose: Point3DStamped, area: Point3D, max_height_offset: Double): Future<ManipulationActuator.MoveitResult?>
    @Throws(IOException::class)
    fun wipeArea(target_entity: Entity, pose: Pose3D, area_width: Double, area_length: Double, max_height_offset: Double): Future<ManipulationActuator.MoveitResult?>
    @Throws(IOException::class)
    fun wipeArea(target_entity_name: String, pose: Pose3D, area_width: Double, area_length: Double, max_height_offset: Double): Future<ManipulationActuator.MoveitResult?>

    /**
     * Approach the given target pose
     */
    fun approachPose(pose: Pose3D, flip: Boolean, min_dist : Point3D = Point3D(-0.02,-0.02,-0.02, LengthUnit.METER), max_dist : Point3D = Point3D(0.02,0.02,0.02, LengthUnit.METER), upright: Boolean = false): Future<ManipulationActuator.MoveitResult?>

    /**
     * pours current attachedEntity above the target Entity
     */
    @Throws(IOException::class)
    fun pourInto(target_entity: Entity, attachedEntity: Entity? = null): Future<ManipulationActuator.MoveitResult?>

    /**
     * add entities to moveit planning scene
     */
    @Throws(IOException::class)
    fun setupPlanningScene(entities: List<Entity>, clear_scene: Boolean = false, clear_attached : Boolean = false): Future<Boolean>

    /**
     * add entities inside -size to size box around base_link to planning scene
     */
    @Throws(IOException::class)
    fun setupPlanningSceneArea(size: Float, clear_scene: Boolean = false, clear_attached : Boolean = false, no_graspable : Boolean = false): Future<Boolean>

    @Throws(IOException::class)
    fun attachEntity(entity: Entity, pose: Pose3D? = null,  create: Boolean = true): Future<Boolean>

    @Throws(IOException::class)
    fun openDoor(door: Entity): Future<ManipulationActuator.MoveitResult?>

    @Throws(IOException::class)
    fun getBoundingBox(type: Model): Future<BoundingBox3D?>

    @Throws(IOException::class)
    fun retract(): Future<ManipulationActuator.MoveitResult?>
}
