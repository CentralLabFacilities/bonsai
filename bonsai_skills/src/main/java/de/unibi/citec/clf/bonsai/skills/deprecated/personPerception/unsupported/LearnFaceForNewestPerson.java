package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;

import de.unibi.citec.clf.bonsai.actuators.FaceIdentificationHumavipsActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;

import java.io.IOException;
import java.util.Date;

/**
 * This state will add a new person to a PersonDataList and learn its face.
 *
 * If a PersonDataList has been written to SceneMemory before it will be used. It starts starting timeout when person
 * was facing robot once.
 *
 * <pre>
 * Special exit statuses:
 * <code>error</code> if no person is standing in front of the robot.
 * </pre>
 *
 *
 * @author lkettenb
 */
public class LearnFaceForNewestPerson extends AbstractSkill {

    //Constants
    private static final int TIME_TO_SLEEP = 500;
    private static final String STATE_INTRO1 = "Please look into my upper camera ";
    private static final String STATE_INTRO3 = "I am learning your face now.";
    private static final String STATE_FINISHED = "Thank you!";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenNoFace;

    //Actuator
    private SpeechActuator speechActuator;
    private FaceIdentificationHumavipsActuator faceActuator;

    //Sensors
    //private Sensor<FaceIdentificationList> faceSensor;
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;
    private MemorySlot<String> personIdSlot;

    private List<PersonData> personDataList;
    private Date start = Time.now();

    private boolean assigned = false;

    private static final String SPEAKHELP_KEY = "#_SPEAKHELP";
    private boolean speakHelp = true;

    private static final String STOREPERSONS_KEY = "#_STOREPERSONS";
    private boolean storePersons = true;

    @Override
    public void configure(ISkillConfigurator configurator) {
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        faceActuator = configurator.getActuator("FaceActuator", FaceIdentificationHumavipsActuator.class);
        //faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);

        speakHelp = configurator.requestOptionalBool(SPEAKHELP_KEY, true);
        storePersons = configurator.requestOptionalBool(STOREPERSONS_KEY, true);

        if (storePersons) {
            knownPersonsMemorySlot = configurator.getSlot(
                    "personDataMemorySlot", List.getListClass(PersonData.class));
        }

        personIdSlot = configurator.getSlot("personIdSlot", String.class);

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenNoFace = configurator.requestExitToken(ExitStatus.ERROR().ps("noFace"));

    }

    @Override
    public boolean init() {

        if (storePersons) {
            try {
                personDataList = knownPersonsMemorySlot.recall();
            } catch (CommunicationException ex) {
                logger.fatal(ex);
                return false;
            }
            if (personDataList == null || personDataList.isEmpty()) {
                logger.fatal("There was no person in the slot");
                return false;
            }
        }

        if (speakHelp) {
            say(STATE_INTRO1, false);
        }
        start = Time.now();
        if (speakHelp) {
            say(STATE_INTRO3, true);
        }
        assigned = false;
        return true;
    }

    long forceIdTime;

    final int FORCE_TIME_MS = 1000;

    @Override
    public ExitToken execute() {
/*
        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(300);
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return tokenNoFace;
        }

        // find largest face
        FaceIdentificationList.FaceIdentification largestFace = null;
        double maxFaceSize = 0;
        for (FaceIdentificationList.FaceIdentification face : list) {
            double size = face.getRegionWidth() * face.getRegionHeight();
            if (largestFace == null || size > maxFaceSize) {
                largestFace = face;
                maxFaceSize = size;
            }
        }

        // check if face has valid ID
        if (largestFace == null || largestFace.getClassId() < 0) {
            logger.error("largest face with size " + maxFaceSize + " has illegal ID " + largestFace.getClassId() + ". Retry !!!");
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        String pId = String.valueOf(largestFace.getClassId());

        if (storePersons) {
            /*
            PersonData pers = personDataList.get(personDataList.size() - 1);
            logger.info("learning face for pId: " + pers.getId() + " faceId is: " + largestFace.getClassId());
            pId = String.valueOf(pers.getId());
            pers.setFaceId(largestFace.getClassId());
            personDataList.updatePersonData(personDataList.size() - 1, pers);
            unsupported * /
        }

        try {
            if (storePersons) {
                knownPersonsMemorySlot.memorize(personDataList);
            }
            personIdSlot.memorize(pId);
        } catch (CommunicationException e) {
            logger.error("Cannot communicate with memory: " + e.getMessage());
            logger.debug("Cannot communicate with memory: " + e.getMessage(), e);
            return ExitToken.fatal();
        }*/

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curStatus) {
        if (speakHelp) {
            say(STATE_FINISHED, true);
        }
        return curStatus;
    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     * @param async if <code>true</code>, the method call will return as fast as possible, blocks otherwise
     */
    private void say(String text, boolean async) {
        try {
            if (async) {
                speechActuator.sayAsync(text);
            } else {
                speechActuator.say(text);
            }
        } catch (IOException ex) {
            // Not so bad. The robot just doesn't say anything.
            logger.warn(ex.getMessage());
        }
    }
}
