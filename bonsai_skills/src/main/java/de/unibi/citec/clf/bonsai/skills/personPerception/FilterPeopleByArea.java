package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.knowledgebase.Location;
import de.unibi.citec.clf.btl.data.knowledgebase.Room;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import sun.security.provider.PolicyParser;

import java.util.LinkedList;
import java.util.List;

/**
 * This skill is intended to remove persons from a persondata list that are not in a given area string. can be a location or room name.
 * If the area is a room, person only stay in list if they are inside the poligon
 * If the area is a location, person stay in list if they are closest to that location
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataListReadSlot: [PersonDataList] [Read]
 *      -> Memory slot the unfiltered list of persons will be read from
 *  PersonDataListWriteSlot: [PersonDataList] [Write]
 *      -> Memory slot the filtered list of persons will be written to
 *
 *  AreaSlot: [String] [Read]
 *      -> Memory Slot for the Area by that shall be filtered
 *
 *
 * ExitTokens:
 *  success:                List successfully filtered
 *  error:                  Name of the Location could not be retrieved or no persons in list
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class FilterPeopleByArea extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessEmpty;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataReadSlot;
    private MemorySlotWriter<PersonDataList> personDataWriteSlot;
    private MemorySlotReader<String> areaSlot;

    private KBaseActuator kBaseActuator;

    private PersonDataList personDataList;
    private PersonDataList newPersonDataList;
    private String area;

    private final double THRESHHOLD = 1.0;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().ps("empty"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
        areaSlot = configurator.getReadSlot("AreaSlot", String.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            personDataList = personDataReadSlot.recall();
            if (personDataList == null) {
                logger.error("your PersonDataListReadSlot was empty");
                return false;
            }
            area = areaSlot.recall();
            if (area == null) {
                logger.error("your area slot was empty");
                return false;
            }
            area = area.toLowerCase();
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        newPersonDataList = new PersonDataList();
        logger.info("person list size before area filtering: " + personDataList.size());
        removePersonsIfNotInArea();
        logger.info("person list size after area filtering: " + newPersonDataList.size());
        return true;
    }

    @Override
    public ExitToken execute() {
        if(newPersonDataList.size() == 0){
            return tokenSuccessEmpty;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataWriteSlot.memorize(newPersonDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize personDataList");
                return tokenError;
            }
        }
        return curToken;
    }

    private boolean isRoom(){
        java.util.List<Room> rooms = kBaseActuator.getArena().getRooms();
        for (Room room:rooms) {
            if (room.getName().toLowerCase().equals(area)) {
                logger.debug("area is room " + area);
                return true;
            }
        }
        logger.debug("area is location " + area);
        return false;
    }

    private void removePersonsIfNotInArea(){
        String inferedLocation;
        if(isRoom()){
            for (PersonData personData: personDataList){
                try {
                    logger.debug("Person postion: " + personData.getPosition().toString());
                    inferedLocation = kBaseActuator.getRoomForPoint(personData.getPosition()).getName().toLowerCase();
                    if(inferedLocation.equals(area)){
                        logger.debug("Person in room " + area + " - keeping in list");
                        newPersonDataList.add(personData);
                    } else {
                        logger.debug("Person NOT in room " + area + " - NOT keeping in list");
                    }
                } catch (KBaseActuator.BDONotFoundException e) {
                    logger.fatal("Should never ever occur." + e.getMessage());
                } catch (KBaseActuator.NoAreaFoundException e) {
                    logger.debug("Position was in no location." + e.getMessage());
                }
            }
        } else {
            for (PersonData personData: personDataList){
                Point2D personloc = personData.getPosition();
                logger.debug("Person postion: " + personData.getPosition().toString());

                Arena arena = kBaseActuator.getArena();

                Location loc = arena.getSpecificLocation(area.toLowerCase());

                PrecisePolygon poly = loc.getAnnotation().getPolygon();

                double distance = poly.getDistance(personloc);

                if(distance < THRESHHOLD){
                    newPersonDataList.add(personData);
                    logger.debug("Person in location area " + area + " - keeping in list");
                }

                /*
                logger.debug("Person postion: " + personData.getPosition().toString());
                inferedLocation = kBaseActuator.getArena().getNearestLocation(personData.getPosition()).getName().toLowerCase();
                if(inferedLocation.equals(area)){
                    logger.debug("Person in location area " + area + " - keeping in list");
                    newPersonDataList.add(personData);
                } else {
                    logger.debug("Person NOT in location area " + area + " - NOT keeping in list");
                }
                */
            }
        }
    }
}
