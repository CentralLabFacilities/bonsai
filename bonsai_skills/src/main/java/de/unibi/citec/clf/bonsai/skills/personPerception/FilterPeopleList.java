package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.ECWMSpirit;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.data.world.Entity;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * This Skill is used to filter a List of Persons by one or more specific attributes.
 * These Attributes can be any of the Attributes found in PersonAttribute, i.e. gesture, posture, gender, shirt color
 * and age. They are read via Slots (see below). Multiple values can be given, if e.g. the gestures are separated by
 * semicolons ("waving;pointing left;neutral")
 * <pre>
 *
 * Options:
 *  #_DO_GESTURE_FILTERING  [boolean] Optional (default: false)
 *      -> Filter by gesture using option or slot
 *  #_DO_POSTURE_FILTERING  [boolean] Optional (default: false)
 *      -> Filter by person posture using option or slot
 *  #_DO_ROOM_FILTERING     [boolean] Optional (default: true)
 *      -> Filter by room using option or slot
 *  #_GESTURES              [String] Optional
 *      -> The gestures to filter for. If not set, but DO_GESTURE_FILTERING is true, will use the slot instead
 *  #_POSTURE               [String] Optional
 *      -> The postures to filter for. If not set, but DO_POSTURE_FILTERING is true, will use the slot instead
 *  #_ROOMS                 [String] Optional
 *      -> The rooms to filter for. If not set, but DO_ROOM_FILTERING is true, will use the slot instead
 *
 * Slots:
 *  PersonDataListReadSlot: [PersonDataList] [Read]
 *      -> Memory slot the unfiltered list of persons will be read from
 *  PersonDataListWriteSlot: [PersonDataList] [Write]
 *      -> Memory slot the filtered list of persons will be written to
 *
 *  GestureReadSlot: [String] [Read]
 *      -> Memory Slot for the Gesture by that shall be filtered
 *  PostureReadSlot: [String] [Read]
 *      -> Memory Slot for the Posture by that shall be filtered
 *  RoomReadSlot: [String] [Read]
 *      -> Memory Slot for the Room by that shall be filtered
 *
 * ExitTokens:
 *  success:                List successfully filtered, at least one PersonData remaining
 *  success.noPeople        List successfully filtered, but no Person remaining/ List empty
 *  error:                  Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  ECWMSpirit
 *
 * </pre>
 *
 * @author 
 */
public class FilterPeopleList extends AbstractSkill {

    private static final String KEY_GESTURE_FILTERING = "#_DO_GESTURE_FILTERING";
    private static final String KEY_POSTURE_FILTERING = "#_DO_POSTURE_FILTERING";
    private static final String KEY_ROOM_FILTERING = "#_DO_ROOM_FILTERING";
    private final static String KEY_GESTURES = "#_GESTURES";
    private final static String KEY_POSTURES = "#_POSTURES";
    private final static String KEY_ROOMS = "#_ROOMS";

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataReadSlot;
    private MemorySlotWriter<PersonDataList> personDataWriteSlot;

    private MemorySlotReader<String> gestureReadSlot = null;
    private MemorySlotReader<String> roomReadSlot = null;
    private MemorySlotReader<String> postureReadSlot = null;

    private PersonDataList personDataList;
    private String postureString = "";
    private String gestureString = "";
    private String roomString = "";
    private PrecisePolygon[] rooms;

    private ECWMSpirit ecwm;
    private CoordinateTransformer coordTransformer;
    private PrecisePolygon Room = null;

    private boolean doGestureFiltering = false;
    private boolean doPostureFiltering = false;
    private boolean doRoomFiltering = true;


    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noPeople"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);

        ecwm = configurator.getActuator("ECWMSpirit", ECWMSpirit.class);

        coordTransformer = (CoordinateTransformer) configurator.getTransform();

        doGestureFiltering = configurator.requestOptionalBool(KEY_GESTURE_FILTERING, doGestureFiltering);
        doPostureFiltering = configurator.requestOptionalBool(KEY_POSTURE_FILTERING, doPostureFiltering);
        doRoomFiltering = configurator.requestOptionalBool(KEY_ROOM_FILTERING, doPostureFiltering);

        if (doGestureFiltering) {
            logger.info("DO: Filter Gesture");
            if (configurator.hasConfigurationKey(KEY_GESTURES))
                gestureString = configurator.requestOptionalValue(KEY_GESTURES, gestureString);
            else
                gestureReadSlot = configurator.getReadSlot("GestureStringSlot", String.class);
        }
        if (doPostureFiltering) {
            logger.info("DO: Filter Posture");
            if (configurator.hasConfigurationKey(KEY_POSTURES))
                postureString = configurator.requestOptionalValue(KEY_POSTURES, postureString);
            else
                postureReadSlot = configurator.getReadSlot("PostureStringSlot", String.class);
        }

        if (doRoomFiltering) {
            logger.info("DO: Filter Room");
            if (configurator.hasConfigurationKey(KEY_POSTURES))
                postureString = configurator.requestOptionalValue(KEY_POSTURES, postureString);
            else
                roomReadSlot = configurator.getReadSlot("PostureStringSlot", String.class);
        }
        if (doRoomFiltering) {
            if (configurator.hasConfigurationKey(KEY_ROOMS))
                roomString = configurator.requestOptionalValue(KEY_ROOMS, roomString);
            else
                roomReadSlot = configurator.getReadSlot("RoomStringSlot", String.class);
        }
    }

    @Override
    public boolean init() {
        try {
            personDataList = personDataReadSlot.recall();
            if (personDataList == null) {
                logger.error("your PersonDataListReadSlot was empty");
                return false;
            }
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        try {
            if(doRoomFiltering){
                if (roomString.isEmpty() && roomReadSlot != null)
                    roomString = roomReadSlot.recall();
                String[] roomStringList = roomString.split(";");
                for (String room: roomStringList) {
                    Future<PrecisePolygon> roomFuture;
                    try {
                        roomFuture = ecwm.getRoomPolygon(new Entity(room, "/misc/room", null));
                    } catch (IOException e) {
                        logger.error("Unable to get room: " + room, e);
                        return false;
                    }
                    try {
                        Room = roomFuture.get();
                    } catch (InterruptedException | ExecutionException e) {
                        logger.error("Unable to get room: " + room, e);
                        return false;
                    }
                }
            }
            if(doPostureFiltering){
                if (postureString.isEmpty() && postureReadSlot != null)
                    postureString = postureReadSlot.recall();
            }
            if(doGestureFiltering){
                if (gestureString.isEmpty() && gestureReadSlot != null)
                    gestureString = gestureReadSlot.recall();
            }
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        return true;
    }


    @Override
    public ExitToken execute() {
        if (doGestureFiltering){
            filterByGesture();
        }
        if(doPostureFiltering){
            filterByPosture();
        }
        if(doRoomFiltering){
            filterByRoom();
        }
        if(personDataList == null || personDataList.isEmpty()) {
            logger.info("No People");
            return tokenSuccessNoPeople;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataWriteSlot.memorize(personDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize personDataList");
                return tokenError;
            }
        }
        return curToken;
    }

    private void filterByPosture() {
        if (postureString == null || postureString.isEmpty() ) {
            logger.warn("your PostureSlot was empty, will not filter by posture ");
        } else {
            String[] postureArray = postureString.split(";");
            for (PersonData person : personDataList) {
                boolean has_posture = false;
                for(String p : postureArray) {
                    PersonAttribute.Posture posture = PersonAttribute.Posture.fromString(p);
                    if (posture==null) {
                        logger.error("Could not retrieve posture for string: " + p);
                        continue;
                    }
                    if (person.getPersonAttribute().getPosture().compareTo(posture) == 0) {
                        has_posture = true;
                    }
                }
                if (!has_posture) {
                    personDataList.remove(person);
                }
            }
        }
    }

    private void filterByGesture() {
        if (gestureString == null || gestureString.isEmpty() ) {
            logger.warn("your GestureSlot was empty, will not filter by gesture ");
        } else {
            String[] gestureArray = gestureString.split(";");
            logger.debug("Gesture slot was not null. Filtering by gestures from slot");
            for (PersonData person : personDataList)
            {
                boolean hasGesture = false;
                for (PersonAttribute.Gesture personGesture: person.getPersonAttribute().getGestures()) {
                    for(String g : gestureArray){
                        PersonAttribute.Gesture gesture = PersonAttribute.Gesture.fromString(g);
                        if (gesture==null) {
                            logger.error("Could not retrieve gesture for string: " + g);
                            continue;
                        }
                        if(personGesture.compareTo(gesture)==0) hasGesture = true;
                    }
                if (!hasGesture) personDataList.remove(person);
                }
            }
        }
    }

    private void filterByRoom() {
        logger.debug("Retrieved " + personDataList.size() + " people, filtering by room..." );

        for(PersonData person:personDataList){
            logger.debug(person.getPosition());

            try {
                logger.debug(Room + "          " + coordTransformer.transform(person.getPosition(), "map").getTranslation());
                if (!Room.contains(coordTransformer.transform(person.getPosition(), "map").getTranslation())) {
                    personDataList.remove(person);
                }

            } catch(TransformException e){
                throw new RuntimeException(e);
            }
        }
    }
}
