package de.unibi.citec.clf.bonsai.actuators

import de.unibi.citec.clf.bonsai.core.`object`.Actuator
import de.unibi.citec.clf.btl.data.ecwm.Spirit
import de.unibi.citec.clf.btl.data.ecwm.SpiritGoal
import de.unibi.citec.clf.btl.data.ecwm.StorageList
import de.unibi.citec.clf.btl.data.geometry.Pose3D
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.btl.data.world.EntityList
import java.io.IOException
import java.util.concurrent.Future

interface ECWMSpirit : Actuator {

    enum class BlockageHandling(val value: Int) {
        FAIL(0),
        USE_BEST(1),
        USE_NEAREST(2);
    }

    enum class SpiritGoalStatus(val value: Int) {
        SUCCESS(0),
        BLOCKED(1),
        BLOCKED_HANDLE_FAILED(2),
        MISSING_ENTITY(11),
        MISSING_SPIRIT(12),
        UNKNOWN_ERROR(100);
        companion object {
            private val BY_INT: MutableMap<Int, SpiritGoalStatus> = HashMap()

            init {
                for (e in SpiritGoalStatus.entries) {
                    BY_INT[e.value] = e
                }
            }

            fun valueOf(i: Int): SpiritGoalStatus {
                return BY_INT[i] ?: UNKNOWN_ERROR
            }
        }
    }

    data class SpiritGoalResult(val status : SpiritGoalStatus, val goal : SpiritGoal)

    /**
     * Get a SpiritGoal for the given entity/storage/spirit
     *
     * @param forceMoveThreshold find a better goal even if already inside the spirit and over the cost threshold
     * @param onBlocked how to handle if everything is blocked (nearest/best disregard global costmap for planning)
     */
    @Throws(IOException::class)
    fun getSpiritGoal(entity: Entity, spirit: String?, storage: String?, forceMoveThreshold: Int = 255, onBlocked: BlockageHandling = BlockageHandling.USE_NEAREST, considerRoom : Boolean = true): Future<SpiritGoalResult?>
    fun getSpiritGoal(spirit: Spirit, forceMoveThreshold: Int = 255, onBlocked: BlockageHandling = BlockageHandling.USE_NEAREST, considerRoom : Boolean = true): Future<SpiritGoalResult?>
    fun getSpiritGoalCurrent(spirit: Spirit, onBlocked: BlockageHandling = BlockageHandling.USE_NEAREST, blockedMaxDist: Float = 0.2f): Future<SpiritGoal?>

    @Throws(IOException::class)
    fun getRoomsOf(pose : Pose3D): Future<EntityList?>

    @Throws(IOException::class)
    fun getRoomPolygon(entity: Entity): Future<PrecisePolygon?>

    @Throws(IOException::class)
    fun getEntitiesInRoom(room: Entity, includeObjects: Boolean = false, includeRooms: Boolean = false): Future<EntityList?>

    @Throws(IOException::class)
    fun fetchEntityStorages(enitiy: Entity): Future<StorageList?>

}
