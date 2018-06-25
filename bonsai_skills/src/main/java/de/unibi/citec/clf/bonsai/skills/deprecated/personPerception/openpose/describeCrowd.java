package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;

import de.unibi.citec.clf.bonsai.actuators.GetCrowdAttributesActuator;
import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.KBase;
import de.unibi.citec.clf.btl.data.knowledgebase.Crowd;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;

import java.io.IOException;
import java.util.LinkedList;
import java.util.concurrent.ExecutionException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Tobi describes the crowd in front of him. Information can be said immediately or saved to Knowledge Base for future
 * use
 *
 *
 * <pre>
 *
 * optiones: Key possible Values Description
 *      #_SAY_INFO [false default, true]
 *              -> Enables the "SpecificPositionSlot" which will be used to set a specific viewport of the goal to navigate to
 *TODO more
 *
 * possible return states are:
 *      success.noPeople -> robot has not seen any persons
 *      success.peopleFound -> robot has seen any amount of people != 0
 *      error -> some error has occured
 *      fatal -> a hard error occurred e.g. Slot communication error
 *
 * TODO more
 *
 * </pre>
 *
 * @author jkummert
 * @author rfeldhans
 */
@Deprecated // needs refactoring in regards to Persons
public class describeCrowd extends AbstractSkill {

    private final static String KEY_SAVETO_KB = "#_SAVETO_KB";
    private final static String KEY_SAY_INFO = "#_SAY_INFO";
    private final static String KEY_POSES = "#_POSES";
    private final static String KEY_GESTURES = "#_GESTURES";
    private final static String KEY_GENDER = "#_GENDER";
    private final static String KEY_HAIR_COLOR = "#_HAIR_COLOR";
    private final static String KEY_SHIRT_COLOR = "#_SHIRT_COLOR";

    //defaults
    boolean saveKB = true;
    boolean sayInfo = false;
    boolean extractPoses = true;
    boolean extractGestures = true;
    boolean extractGender = true;
    boolean extractHairColor = false;
    boolean extractShirtColor = false;

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccessPeopleFound;

    private Crowd crowd;
    private KBaseActuator kBaseActuator;

    /*
     * Actuators used by this state.
     */
    private GetCrowdAttributesActuator getCrowdAttributesActuator;
    private SpeechActuator speechActuator;

    /*
     * Sensors used by this state.
     */
    private Sensor<PositionData> positionSensor;
    private PositionData robotPos;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccessPeopleFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("peopleFound"));

        saveKB = configurator.requestOptionalBool(KEY_SAVETO_KB, saveKB);
        sayInfo = configurator.requestOptionalBool(KEY_SAY_INFO, sayInfo);
        extractPoses = configurator.requestOptionalBool(KEY_POSES, extractPoses);
        extractGestures = configurator.requestOptionalBool(KEY_GESTURES, extractGestures);
        extractGender = configurator.requestOptionalBool(KEY_GENDER, extractGender);
        extractHairColor = configurator.requestOptionalBool(KEY_HAIR_COLOR, extractHairColor);
        extractShirtColor = configurator.requestOptionalBool(KEY_SHIRT_COLOR, extractShirtColor);

        // Initialize slots

        // Initialize actuators
        getCrowdAttributesActuator = configurator.getActuator("GetCrowdAttributesActuator", GetCrowdAttributesActuator.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
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
            Logger.getLogger(describeCrowd.class.getName()).log(Level.SEVERE, null, ex);
        }

        //crowd = kbase.getCrowd();
        crowd =new Crowd();
        List<PersonData> persons = new List<>(PersonData.class);
        logger.debug("Parsing people list");
        for (PersonAttribute personAttribute : personAttributes) {
            logger.debug("Person: " + personAttribute.toString() + "\nDist: ??" + /*+ personAttribute.getDistanceToRobot() +*/ " Center of Mass: ??" /*+ personAttribute.calculateCenterOfMass()*/);

            /*
            if (personAttribute.getConfidence() < 0.5 && personAttribute.getAverageConfidence() < 0.5) {
                logger.debug("Rejected!");
                continue;
            }*/
            PersonData person = new PersonData();
            person.setPersonAttribute(personAttribute);
            person.setUuid("dummy"+String.valueOf(Math.random()));
            person.setPosition(robotPos);
            /*
            Point2D personPositionLocal = personAttribute.getPosition();
            Point2D personPositionGlobal = CoordinateSystemConverter.localToGlobal(personPositionLocal, robotPos);
            person.setLastKnownPosition(personPositionGlobal);

            logger.debug("GlobalCoordinates: " + person.getLastKnownPosition());

            if (!(kbase.getArena().getCurrentRoom(person.getLastKnownPosition()).equals("outside") || kbase.getArena().getCurrentRoom(person.getLastKnownPosition()).equals("outside the arena"))) {
                logger.debug("Not in arena!");
                persons.add(person);
            }
            */

            persons.add(person);
            try {
                kBaseActuator.storeBDO(person);
            } catch (KBaseActuator.BDOHasInvalidAttributesException e) {
                logger.error("Person could not be stored in kBase invalidAttributes");
                e.printStackTrace();
            }
        }
        crowd.setPersons(persons);
        //kbase.setCrowd(crowd);

        String people = " persons";
        if (personAttributes.size() == 1) {
            people = " person";
        }
        int countMale = crowd.getMaleCount(persons);
        int countFemale = crowd.getFemaleCount(persons);
        if (sayInfo) {
            try {
                speechActuator.say("I see " + crowd.getPersons().size() + people + " " + countFemale + " female and " + countMale + " male.");
            } catch (IOException ex) {
                Logger.getLogger(describeCrowd.class.getName()).log(Level.SEVERE, null, ex);
            }
        }
        return tokenSuccessPeopleFound;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
