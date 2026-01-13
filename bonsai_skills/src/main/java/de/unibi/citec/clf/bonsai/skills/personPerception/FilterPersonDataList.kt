package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.exception.TransformException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.data.world.Entity
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.btl.data.person.PersonAttribute

/**
 * This Skill is used to filter a List of Persons by one or more specific attributes.
 *
 * These Attributes can be any of the Attributes found in PersonAttribute,
 * i.e. gesture, posture and if they are inside a specific room.
 *
 * Multiple values can be given, if e.g. the gestures are separated by semicolons
 * ("waving;pointing left;neutral")
 *
 * <pre>
 *
 * Options:
 * #_DO_GESTURE_FILTERING  [boolean] Optional (default: false)
 *      -> Filter by gesture using option or slot
 * #_DO_POSTURE_FILTERING  [boolean] Optional (default: false)
 *      -> Filter by person posture using option or slot
 * #_DO_ROOM_FILTERING     [boolean] Optional (default: false)
 *      -> Filter by room using option or slot
 * #_GESTURES              [String] Optional
 *      -> The gestures to filter for. Also, sets DO_GESTURE_FILTERING
 * #_POSTURE               [String] Optional
 *      -> The postures to filter for. Also, sets DO_POSTURE_FILTERING
 * #_ROOMS                 [String] Optional
 *      -> The rooms to filter for. Also, sets DO_ROOM_FILTERING
 *
 * Slots:
 * PersonDataListReadSlot: [PersonDataList] (Read)
 *      -> Memory slot the unfiltered list of persons will be read from
 * PersonDataListWriteSlot: [PersonDataList] (Write)
 *      -> Memory slot the filtered list of persons will be written to
 *
 * GestureReadSlot: [String] (Optional, Read)
 *      -> Memory Slot for the Gesture by that shall be filtered
 * PostureReadSlot: [String] (Optional, Read)
 *      -> Memory Slot for the Posture by that shall be filtered
 * RoomReadSlot: [String] (Optional, Read)
 *      -> Memory Slot for the Room by that shall be filtered
 *
 * ExitTokens:
 * success.notEmpty:        List successfully filtered, at least one PersonData remaining
 * success.empty:           List successfully filtered, but no Person remaining / List empty
 * error:                   Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMSpirit
 *
</pre> *
 *
 * @author
 */
class FilterPersonDataList : AbstractSkill() {
    private var tokenSuccessHasPeople: ExitToken? = null
    private var tokenSuccessNoPeople: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var personDataReadSlot: MemorySlotReader<PersonDataList?>? = null
    private var personDataWriteSlot: MemorySlotWriter<PersonDataList?>? = null

    private var gestureReadSlot: MemorySlotReader<String?>? = null
    private var roomReadSlot: MemorySlotReader<String>? = null
    private var postureReadSlot: MemorySlotReader<String?>? = null

    private var personDataList: PersonDataList? = null
    private var postureString: String? = ""
    private var gestureString: String? = ""
    private var roomString = ""
    private val rooms: MutableList<PrecisePolygon?> = mutableListOf()

    private var ecwm: ECWMSpirit? = null
    private var coordTransformer: CoordinateTransformer? = null

    private var doGestureFiltering = false
    private var doPostureFiltering = false
    private var doRoomFiltering = false


    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccessHasPeople = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notEmpty"))
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().ps("empty"))
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        personDataReadSlot =
            configurator.getReadSlot("PersonDataListReadSlot", PersonDataList::class.java)
        personDataWriteSlot =
            configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList::class.java)

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)

        coordTransformer = configurator.getTransform() as? CoordinateTransformer

        if (configurator.hasConfigurationKey(KEY_GESTURES)) {
            gestureString = configurator.requestValue(KEY_GESTURES)
            doGestureFiltering = true
            doGestureFiltering = configurator.requestOptionalBool(KEY_GESTURE_FILTERING, doGestureFiltering)
        } else {
            doGestureFiltering = configurator.requestOptionalBool(KEY_GESTURE_FILTERING, doGestureFiltering)
            if (doGestureFiltering) {
                gestureReadSlot = configurator.getReadSlot("GestureStringSlot", String::class.java)
            }
        }

        if (configurator.hasConfigurationKey(KEY_ROOMS)) {
            doRoomFiltering = true
            roomString = configurator.requestValue(KEY_ROOMS)
            doRoomFiltering = configurator.requestOptionalBool(KEY_ROOM_FILTERING, doRoomFiltering)
        } else {
            doRoomFiltering = configurator.requestOptionalBool(KEY_ROOM_FILTERING, doRoomFiltering)
            if (doRoomFiltering) {
                roomReadSlot = configurator.getReadSlot("RoomStringSlot", String::class.java)
            }
        }

        if (configurator.hasConfigurationKey(KEY_POSTURES)) {
            doPostureFiltering = true
            postureString = configurator.requestValue(KEY_POSTURES)
            doPostureFiltering = configurator.requestOptionalBool(KEY_POSTURE_FILTERING, doPostureFiltering)
        } else {
            doPostureFiltering = configurator.requestOptionalBool(KEY_POSTURE_FILTERING, doPostureFiltering)
            if (doPostureFiltering) {
                postureReadSlot = configurator.getReadSlot("PostureStringSlot", String::class.java)
            }
        }

    }

    override fun init(): Boolean {
        personDataList = personDataReadSlot?.recall<PersonDataList>() ?: run {
            logger.error("personDataList is null")
            return false
        }

        if (doRoomFiltering) {
            roomString = roomReadSlot?.recall<String>() ?: roomString
            val roomStringList = roomString.split(";")
            for (room in roomStringList) {
                val roomFuture = ecwm?.getRoomPolygon(Entity(room, "/misc/room", null)) ?: run {
                    return false
                }
                rooms.add(roomFuture.get())
            }
        }

        if (doPostureFiltering) {
            postureString = postureReadSlot?.recall<String?>() ?: postureString
        }

        if (doGestureFiltering) {
            gestureString = gestureReadSlot?.recall<String?>() ?: gestureString
        }


        return true
    }


    override fun execute(): ExitToken? {
        if (doGestureFiltering) {
            filterByGesture()
        }
        if (doPostureFiltering) {
            filterByPosture()
        }
        if (doRoomFiltering) {
            filterByRoom()
        }

        if (personDataList?.isEmpty() == true) {
            logger.info("No more People left")
            return tokenSuccessNoPeople
        } else {
            logger.info("still have ${personDataList?.size} People")
            personDataWriteSlot?.memorize<PersonDataList?>(personDataList)
            return tokenSuccessHasPeople
        }


    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }

    private fun filterByPosture() {
        val postures = postureString?.split(";")?.map { PersonAttribute.Posture.fromString(it) } ?: listOf()
        logger.info("filter for postures: ${postures.joinToString("; ")}")
        personDataList = PersonDataList().also { list ->
            list.addAll(personDataList?.filter {
                val ret = postures.contains(it.personAttribute.posture)
                if(ret) logger.info("remove person $it")
                ret
            })
        }
    }

    private fun filterByGesture() {
        val gestures = gestureString?.split(";")?.map { PersonAttribute.Gesture.fromString(it) } ?: listOf()
        logger.info("filter for gestures: ${gestures.joinToString("; ")}")
        personDataList = PersonDataList().also { list ->
            list.addAll(personDataList?.filter {
                for (gesture in gestures) {
                    if (it.personAttribute.gestures.contains(gesture)) {
                        return@filter true
                    }
                }
                logger.info("remove person $it")
                false
            })
        }

    }

    private fun filterByRoom() {
        logger.info("filter for rooms")

        personDataList = PersonDataList().also { list ->
            list.addAll(personDataList?.filter {
                for (room in rooms) {
                    if (room?.contains(coordTransformer?.transform(it.position, "map")?.translation) == true) {
                        return@filter true
                    }
                }
                logger.info("remove person $it")
                false
            })
        }

    }

    companion object {
        private const val KEY_GESTURE_FILTERING = "#_DO_GESTURE_FILTERING"
        private const val KEY_POSTURE_FILTERING = "#_DO_POSTURE_FILTERING"
        private const val KEY_ROOM_FILTERING = "#_DO_ROOM_FILTERING"
        private const val KEY_GESTURES = "#_GESTURES"
        private const val KEY_POSTURES = "#_POSTURES"
        private const val KEY_ROOMS = "#_ROOMS"
    }
}
