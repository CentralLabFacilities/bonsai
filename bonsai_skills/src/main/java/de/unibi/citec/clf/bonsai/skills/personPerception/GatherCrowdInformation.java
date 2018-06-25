package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GetCrowdAttributesActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose.SearchForPerson;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.Crowd;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;

import java.io.IOException;
import java.util.LinkedList;
import java.util.concurrent.ExecutionException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * finds people in crowd and writes them as crowd into a slot.
 * TODO: possibility to only get people in the current room
 *
 * <pre>
 * Options:
 *  #_THIS_ROOM_ONLY: [boolean] Optional (default: false)
 *                          -> Only People that are in the arena will be used
 *
 * Slots:
 *  CrowdSlot: [Crowd] [Write]
 *      -> Crowd of recognized people
 *
 * ExitTokens:
 *  success.noPeople -> robot has not seen any people
 *  success.peopleFound -> robot has seen any amount of people != 0. Crowd saved to memory
 *  fatal -> a hard error occurred e.g. Slot communication error
 *
 * Actuators:
 *  GetCrowdAttributesActuator:    [GetCrowdAttributesActuator]
 *      -> Recognize gestures und postures people are making
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Read in current robot position
 *
 * </pre>
 *
 * @author jsimmering
 */
public class GatherCrowdInformation extends AbstractSkill {

    private final static String KEY_THIS_ROOM_ONLY = "#_THIS_ROOM_ONLY";

    boolean thisRoom = false;

    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccessPeopleFound;

    private MemorySlotWriter<Crowd> crowdSlot;

    private GetCrowdAttributesActuator getCrowdAttributesActuator;
    private Sensor<PositionData> positionSensor;
    private PositionData robotPos;

    private Crowd crowd;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        thisRoom = configurator.requestOptionalBool(KEY_THIS_ROOM_ONLY, thisRoom);

        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccessPeopleFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("peopleFound"));

        crowdSlot = configurator.getWriteSlot("CrowdSlot", Crowd.class);

        getCrowdAttributesActuator = configurator.getActuator("GetCrowdAttributesActuator", GetCrowdAttributesActuator.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        // Look for legs in the current room
        try {
            robotPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        logger.debug("Detecting Persons");

        return true;
    }

    @Override
    public ExitToken execute() {
        java.util.List<PersonAttribute> personAttributes = new LinkedList<>();

        try {
            personAttributes = getCrowdAttributesActuator.getCrowdAttributes();
        } catch (InterruptedException | ExecutionException ex) {
            Logger.getLogger(GatherCrowdInformation.class.getName()).log(Level.SEVERE, null, ex);
        }

        if (personAttributes.isEmpty()) {
            return tokenSuccessNoPeople;
        }

        crowd =new Crowd();
        List<PersonData> persons = new List<>(PersonData.class);
        logger.debug("Parsing people list");
        for (PersonAttribute personAttribute : personAttributes) {
            //TODO get real People from CrowdAttributes
            logger.debug("Person: " + personAttribute.toString() + "\nDist: ??  + \nage: " + personAttribute.getAge() + "\ngender: " + personAttribute.getGender() + "\ngesture: " + personAttribute.getGesture() + "\nposture: " + personAttribute.getPosture() + "\nshirtcolor: " + personAttribute.getShirtcolor() /*+ personAttribute.getDistanceToRobot() +*/);

            //TODO get Confidence and reject those with a low confidence

            if (personAttribute.getAge().equals("")) {
                personAttribute.setAge("25-35");
            }
            PersonData person = new PersonData();
            person.setPersonAttribute(personAttribute);


            if (thisRoom) {
                //TODO
                /*
                Point2D personPositionLocal = personAttribute.getPosition();
                Point2D personPositionGlobal = CoordinateSystemConverter.localToGlobal(personPositionLocal, robotPos);
                person.setLastKnownPosition(personPositionGlobal);

                logger.debug("GlobalCoordinates: " + person.getLastKnownPosition());

                if ((kBaseActuator.getArena().getCurrentRoom(person.getLastKnownPosition()).equals("outside") || kBaseActuator.getArena().getCurrentRoom(person.getLastKnownPosition()).equals("outside the arena"))) {
                    logger.debug("Not in arena!");
                }
                */
            }

            persons.add(person);
        }
        crowd.setPersons(persons);

        return tokenSuccessPeopleFound;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (crowd != null) {
                try {
                    crowdSlot.memorize(crowd);
                } catch (CommunicationException e) {
                    logger.fatal("Unable to write to memory: " + e.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
