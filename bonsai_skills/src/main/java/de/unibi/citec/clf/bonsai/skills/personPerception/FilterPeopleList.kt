package de.unibi.citec.clf.bonsai.skills.personPerception

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException
import de.unibi.citec.clf.bonsai.core.exception.TransformException
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon
import de.unibi.citec.clf.btl.data.person.PersonAttribute
import de.unibi.citec.clf.btl.data.person.PersonDataList
import de.unibi.citec.clf.btl.data.world.Entity
import java.io.IOException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future

/**
 * This Skill is used to filter a List of Persons by one or more specific attributes.
 * These Attributes can be any of the Attributes found in PersonAttribute, i.e. gesture, posture, gender, shirt color
 * and age. They are read via Slots (see below). Multiple values can be given, if e.g. the gestures are separated by
 * semicolons ("waving;pointing left;neutral")
 * <pre>
 *
 * Options:
 * #_GESTURES              [String] Optional
 * -> The gestures to filter for. If set, but expr is empty String, slot will be used instead.
 * #_POSTURE               [String] Optional
 * -> The postures to filter for. If set, but expr is empty String, slot will be used instead.
 * #_ROOMS                 [String] Optional
 * -> The rooms to filter for. If set, but expr is empty String, slot will be used instead.
 *
 * Slots:
 * PersonDataListReadSlot: [PersonDataList] [Read]
 * -> Memory slot the unfiltered list of persons will be read from
 * PersonDataListWriteSlot: [PersonDataList] [Write]
 * -> Memory slot the filtered list of persons will be written to
 * GestureReadSlot: [String] [Read]
 * -> Memory Slot for the Gesture by that shall be filtered
 * PostureReadSlot: [String] [Read]
 * -> Memory Slot for the Posture by that shall be filtered
 * RoomReadSlot: [String] [Read]
 * -> Memory Slot for the Room by that shall be filtered
 *
 * ExitTokens:
 * success:                List successfully filtered, at least one PersonData remaining
 * success.noPeople        List successfully filtered, but no Person remaining/ List empty
 * error:                  Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 * ECWMSpirit
 *
</pre> *
 *
 * @author
 */
class FilterPeopleList : AbstractSkill() {
    private var tokenSuccess: ExitToken? = null
    private var tokenSuccessNoPeople: ExitToken? = null
    private var tokenError: ExitToken? = null

    private var personDataReadSlot: MemorySlotReader<PersonDataList>? = null
    private var personDataWriteSlot: MemorySlotWriter<PersonDataList>? = null

    private var gestureReadSlot: MemorySlotReader<String>? = null
    private var roomReadSlot: MemorySlotReader<String>? = null
    private var postureReadSlot: MemorySlotReader<String>? = null

    private var personDataList: PersonDataList? = null
    private var postureString = ""
    private var gestureString = ""
    private var roomString = ""
    private lateinit var postureStringList: List<String>
    private lateinit var gestureStringList: List<String>
    private lateinit var roomStringList: List<String>

    private var ecwm: ECWMSpirit? = null
    private var coordinateTransformer: CoordinateTransformer? = null
    private var room: PrecisePolygon? = null

    private var doGestureFiltering = false
    private var doPostureFiltering = false
    private var doRoomFiltering = false


    @Throws(SkillConfigurationException::class)
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noPeople"))
        tokenError = configurator.requestExitToken(ExitStatus.ERROR())

        personDataReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList::class.java)
        personDataWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList::class.java)

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit::class.java)

        coordinateTransformer = configurator.getTransform() as CoordinateTransformer?

        if (configurator.hasConfigurationKey(KEY_GESTURES)) {
            gestureString = configurator.requestOptionalValue(KEY_GESTURES, gestureString)
            doGestureFiltering = true
        }
        if (configurator.hasConfigurationKey(KEY_POSTURES)) {
            postureString = configurator.requestOptionalValue(KEY_POSTURES, postureString)
            doPostureFiltering = true
        }
        if (configurator.hasConfigurationKey(KEY_ROOMS)) {
            roomString = configurator.requestOptionalValue(KEY_ROOMS, roomString)
            doRoomFiltering = true
        }

        logger.info("Config: [GestureFiltering: $doGestureFiltering; PostureFiltering: $doPostureFiltering; RoomFiltering: $doRoomFiltering]")

        if (doGestureFiltering && gestureString.isEmpty()) {
            gestureReadSlot = configurator.getReadSlot("GestureStringSlot", String::class.java)
        }
        if (doPostureFiltering && postureString.isEmpty()) {
            postureReadSlot = configurator.getReadSlot("PostureStringSlot", String::class.java)
        }
        if (doRoomFiltering && roomString.isEmpty()) {
            roomReadSlot = configurator.getReadSlot("RoomStringSlot", String::class.java)
        }

        logger.info("Used slots: [GestureStringSlot: ${gestureReadSlot != null}; PostureStringSlot: ${postureReadSlot != null}; RoomStringSlot: ${roomReadSlot != null}]")
    }

    override fun init(): Boolean {
        try {
            personDataList = personDataReadSlot!!.recall<PersonDataList>().also {
                if (it == null) {
                    logger.error("PersonDataListReadSlot didn't contain a PersonDataList, aborting")
                    return false
                }
            }

            if (doGestureFiltering) {
                if (gestureString.isEmpty()) {
                    gestureString = gestureReadSlot!!.recall<String>()
                }
                gestureStringList = gestureString.split(";".toRegex()).dropLastWhile { it.isEmpty() }.forEach {

                }
                gestureStringList.forEach { gestureStr ->
                    if (PersonAttribute.Gesture.fromString(gestureStr) == null) {
                        logger.error("Encountered unknown gesture '$gestureStr', aborting")
                        return false
                    }
                }
            }


        } catch (ex: CommunicationException) {
            logger.fatal("Unable to read from memory: ", ex)
            return false
        }

        try {
            if (doRoomFiltering) {
                if (roomString.isEmpty() && roomReadSlot != null) roomString = roomReadSlot!!.recall<String?>()
                val roomStringList = roomString.split(";".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
                for (room in roomStringList) {
                    val roomFuture: Future<PrecisePolygon?>?
                    try {
                        roomFuture = ecwm?.getRoomPolygon(Entity(room, "/misc/room", null))
                    } catch (e: IOException) {
                        logger.error("Unable to get room: " + room, e)
                        return false
                    }
                    try {
                        this@FilterPeopleList.room = roomFuture!!.get()
                    } catch (e: InterruptedException) {
                        logger.error("Unable to get room: " + room, e)
                        return false
                    } catch (e: ExecutionException) {
                        logger.error("Unable to get room: " + room, e)
                        return false
                    }
                }
            }
            if (doPostureFiltering) {
                if (postureString.isEmpty() && postureReadSlot != null) {
                    postureString = postureReadSlot!!.recall<String?>()
                }
            }
            if (doGestureFiltering) {
                if (gestureString.isEmpty() && gestureReadSlot != null) gestureString =
                    gestureReadSlot!!.recall<String?>()
            }
        } catch (ex: CommunicationException) {
            logger.fatal("Unable to read from memory: ", ex)
            return false
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
        if (personDataList == null || personDataList!!.isEmpty()) {
            logger.info("No People")
            return tokenSuccessNoPeople
        }
        return tokenSuccess
    }

    override fun end(curToken: ExitToken): ExitToken? {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataWriteSlot?.memorize<PersonDataList?>(personDataList)
            } catch (ex: CommunicationException) {
                logger.error("Could not memorize personDataList")
                return tokenError
            }
        }
        return curToken
    }

    private fun filterByPosture() {
        if (postureString == null || postureString!!.isEmpty()) {
            logger.warn("your PostureSlot was empty, will not filter by posture ")
        } else {
            val postureArray = postureString!!.split(";".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()

            for (person in personDataList!!) {
                var has_posture = false
                for (p in postureArray) {
                    val posture: PersonAttribute.Posture? = PersonAttribute.Posture.fromString(p)
                    if (posture == null) {
                        logger.error("Could not retrieve posture for string: " + p)
                        continue
                    }
                    if (person.getPersonAttribute().getPosture().compareTo(posture) == 0) {
                        has_posture = true
                    }
                }
                if (!has_posture) {
                    personDataList?.remove(person)
                }
            }
        }
    }

    private fun filterByGesture() {
        if (gestureString == null || gestureString!!.isEmpty()) {
            logger.warn("your GestureSlot was empty, will not filter by gesture ")
        } else {
            val gestureArray = gestureString.split(";".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
            logger.debug("Gesture slot was not null. Filtering by gestures from slot")
            for (person in personDataList!!) {
                var hasGesture = false
                for (personGesture in person.getPersonAttribute().getGestures()) {
                    for (g in gestureArray) {
                        logger.info("Using string '" + "g" + "' to get gesture")
                        val gesture: PersonAttribute.Gesture? = PersonAttribute.Gesture.fromString(g)
                        if (gesture == null) {
                            logger.error("Could not retrieve gesture for string: " + g)
                            continue
                        }
                        if (personGesture.compareTo(gesture) == 0) hasGesture = true
                    }
                    if (!hasGesture) personDataList?.remove(person)
                }
            }
        }
    }

    private fun filterByRoom() {
        logger.debug("Retrieved " + personDataList!!.size + " people, filtering by room...")

        for (person in personDataList!!) {
            logger.debug(person.getPosition())

            try {
                logger.debug(
                    room.toString() + "          " + coordinateTransformer!!.transform(person.getPosition(), "map")
                        .getTranslation()
                )
                if (!room!!.contains(coordinateTransformer!!.transform(person.getPosition(), "map").getTranslation())) {
                    personDataList!!.remove(person)
                }
            } catch (e: TransformException) {
                throw RuntimeException(e)
            }
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
