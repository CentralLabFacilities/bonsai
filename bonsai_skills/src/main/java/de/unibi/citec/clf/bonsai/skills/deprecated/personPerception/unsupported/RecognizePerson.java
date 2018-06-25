package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.io.IOException;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * In this state the robot tries to recognize the person standing in front of him.
 *
 * @author vlosing
 */
@Deprecated
public class RecognizePerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoPerson;
    private ExitToken tokenSuccessRecognized;
    private ExitToken tokenSuccessUnknown;

    //unsupported private FaceIdentificationSensor2 faceSensor;

    private SpeechActuator speechActuator;
    private MemorySlot<List<PersonData>> knownPersonDataListSlot;
    private MemorySlot<List<PersonData>> recognizedPersonDataListSlot;

    /**
     * List with known persons. Will be read from the memory.
     */
    private List<PersonData> knownPersonDataList;
    /**
     * List with already recognized persons. Will be saved to the memory.
     */
    private List<PersonData> recognizedPersonDataList;
    /**
     * start time of recognition
     */
    private Date start = new Date();
    /**
     * map used to count recognized personIds
     */
    private Map<Integer, Integer> recognitionCounts = new HashMap<>();
    /*
     * What the robot will say.
     */
    private static final String SAY_RECOGNIZED = "You are %s.";

    /*
     * Transitions of state
     */
    private static final String TRANSITION_NO_PERSON = "noPerson";
    private static final String TRANSITION_PERSON_RECOGNIZED = "personRecognized";
    private static final String TRANSITION_PERSON_UNKNOWN = "personUnknown";
    /**
     * Error message if memory cannot be read.
     */
    private static final String ERROR_MEM = "Unable to access memory. "
            + "PersonDataList will be overwritten. ";
    private static final String UNKNOWN_PERSON_NAME = "unknown";
    /**
     * max time used for recognizing person
     */
    private static final long TIME_TO_RECOGNIZE = 2000;
    private static final long NUM_TO_RECOGNIZE = 4;
    private static final long READ_FACEDATA_TIMEOUT = 100;
    /**
     * counts how often recognition returns unknown person
     */
    private int unknownPersonCount = 0;
    /**
     * counts how often recognition was tried
     */
    private int totalRecognitionCount = 0;
    /**
     * flag whether recognition is started
     */
    private boolean recognizingStarted = false;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoPerson = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus(TRANSITION_NO_PERSON));
        tokenSuccessRecognized = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(TRANSITION_PERSON_RECOGNIZED));
        tokenSuccessUnknown = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(TRANSITION_PERSON_UNKNOWN));

        recognizedPersonDataListSlot = configurator.getSlot(
                "recognizedPersonsMemorySlot", List.getListClass(PersonData.class));
        /*faceSensor = (FaceIdentificationSensor2) configurator.getSensor(
                "FaceIdentificationSensor", FaceIdentificationList.class);*/
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);
        knownPersonDataListSlot = configurator.getSlot(
                "personDataMemorySlot", List.getListClass(PersonData.class));
    }

    @Override
    public boolean init() {
        // read list of known persons from memory
        try {
            knownPersonDataList = knownPersonDataListSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Exception while reading from personDataMemorySlot");
            return false;
        }

        if (knownPersonDataList == null) {
            logger.warn("no PersonDataList of known Persons in Memory found");
            knownPersonDataList = new List<>(PersonData.class);
        }

        // read list of recognized persons from memory
        try {
            recognizedPersonDataListSlot.forget();
        } catch (CommunicationException ex) {
            logger.fatal("Exception while forgetting recognizedPersonsMemorySlot");

        }

        recognizedPersonDataList = new List<>(PersonData.class);

        unknownPersonCount = 0;
        totalRecognitionCount = 0;

        /*
        try {
            faceSensor.predict();
        } catch (IOException ex) {
            logger.error(ex.getMessage());
            return false;
        }*/
        start = new Date();
        recognizingStarted = true;

        return true;
    }

    @Override
    public ExitToken execute() {
        // do until recognizetime is elapsed
        // check if person is facing, if true start recognition - not
        // implemented because isFacing does not work

        if ((new Date().getTime() - start.getTime()) > TIME_TO_RECOGNIZE) {
            return tokenSuccess;
        }

        //FaceIdentificationList results;
        /*
        try {
            results = faceSensor.readLast(READ_FACEDATA_TIMEOUT);
        } catch (IOException | InterruptedException e) {
            logger.error(e.getMessage());
            return tokenError;
        }

        if (results == null) {
            return ExitToken.loop();
        }
        for (FaceIdentificationList.FaceIdentification ident : results) {
            if (!ident.isIdentified()) {
                logger.debug(ident.getClassId());
                unknownPersonCount++;
                totalRecognitionCount++;
                continue;
            }
            if (!recognitionCounts.containsKey(ident.getClassId())) {
                recognitionCounts.put(ident.getClassId(), 0);
            }
            recognitionCounts.put(ident.getClassId(), recognitionCounts.get(ident.getClassId()) + 1);
            totalRecognitionCount++;
        }*/

        return ExitToken.loop();

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        logger.debug("totalRecognitionCount: " + totalRecognitionCount
                + ", unknownPersonCount: " + unknownPersonCount);
        // evaluate results

        if (recognizingStarted) {
            /*
            try {
                faceSensor.idle();
            } catch (IOException ex) {
                logger.error(ex);
            }*/
        }

        if (totalRecognitionCount == 0) {
            return tokenErrorNoPerson;
        }

        PersonData personRecognized;
        ExitToken processingStatus;
        int maxClassId = -1;
        if (totalRecognitionCount == unknownPersonCount) {
            personRecognized = new PersonData();
            personRecognized.setName(UNKNOWN_PERSON_NAME);
            processingStatus = tokenSuccessUnknown;
        } else {
            int maxCount = -1;
            for (Map.Entry<Integer, Integer> classCount : recognitionCounts.entrySet()) {
                if (classCount.getValue() > maxCount) {
                    maxCount = classCount.getValue();
                    maxClassId = classCount.getKey();
                }
                logger.debug("count for " + getPersonByID(classCount.getKey())
                        + " (ID=" + classCount.getKey() + ") = " + classCount.getValue());
            }

            // unknownPersonCount/2 to get more positives
            if (unknownPersonCount / 2 > maxCount) {
                //speechActuator.say(SAY_NOT_RECOGNIZED);
                personRecognized = new PersonData();
                personRecognized.setName(UNKNOWN_PERSON_NAME);
                processingStatus = tokenSuccessUnknown;
                //
            } else {
                personRecognized = getPersonByID(maxClassId);
                say(String.format(SAY_RECOGNIZED, personRecognized.getName()));
                processingStatus = tokenSuccessRecognized;
            }
        }

        recognizedPersonDataList.add(personRecognized);
        try {
            recognizedPersonDataListSlot.memorize(recognizedPersonDataList);
        } catch (CommunicationException ex) {
            Logger.getLogger(RecognizePerson.class.getName()).log(Level.SEVERE, null, ex);
        }

        logger.debug("Recognized person ID: " + maxClassId);

        return processingStatus;

    }

    private PersonData getPersonByID(final int iD) {
        for (int i = 0; i < knownPersonDataList.size(); i++) {
            /*if (knownPersonDataList.getPersonData(i).getId() == iD) {
                return knownPersonDataList.getPersonData(i);
            } unsupported*/
        }
        logger.debug("Person with id " + iD + " unknown. Known persons:");
        for (int i = 0; i < knownPersonDataList.size(); i++) {
            // unsupported logger.debug("  id: " + knownPersonDataList.getPersonData(i).getId());
        }
        logger.debug("done");
        return null;
    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     */
    private void say(String text) {
        try {
            speechActuator.say(text);
        } catch (IOException ex) {
            // Not so bad. The robot just says nothing.
            logger.warn(ex.getMessage());

        }
    }

}
