package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;


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
 * If a PersonDataList has been written to SceneMemory before it will be used.
 * It starts starting timeout when person was facing robot once.
 *
 * <pre>
 * Special exit statuses:
 * <code>error</code> if no person is standing in front of the robot.
 * </pre>
 *
 *
 * @author lkettenb
 */
@Deprecated
public class StoreNewPerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    /*
     * What the robot will say.
     */

    private static final String STATE_INTRO1 = "Please look into my upper camera ";
    private static final String STATE_INTRO3 = "I am learning your face now.";
    private static final String STATE_FINISHED = "Thank you!";

    /*
     * Actuators used by this state.
     */
    private SpeechActuator speechActuator;

    /*
     * Sensors used by this state.
     */
    //unsupported private FaceIdentificationSensor2 faceSensor;

    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;

    /**
     * Additional time to learn person.
     */
    private static final long TIME_TO_LEARN = 8000;
    /**
     * Time to sleep after each iteration.
     */
    private static final int TIME_TO_SLEEP = 500;
    /**
     * List with person data. Will be read from and saved to the scene memory.
     */
    private List<PersonData> personDataList;
    /**
     * Time when start learning.
     */
    private Date start = Time.now();
    /**
     * Indicates if learning did start already.
     */
    private boolean learningStarted;
    /**
     * Error message if memory cannot be read.9
     */
    private static final String ERROR_MEM = "Unable to access memory. "
            + "PersonDataList will be overwritten. ";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);
        /*faceSensor = (FaceIdentificationSensor2) configurator.getSensor(
                "FaceIdentificationSensor", FaceIdentificationList.class);*/

        knownPersonsMemorySlot = configurator.getSlot(
                "personDataMemorySlot", List.getListClass(PersonData.class));
    }

    @Override
    public boolean init() {
        try {
            personDataList = knownPersonsMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not load personDataList!");
            return false;
        }
        if (personDataList == null || personDataList.isEmpty()) {
            logger.fatal("There was no person in the slot");
            return false;
        }
        say(STATE_INTRO1, false);
        return true;
    }

    @Override
    public ExitToken execute() {
        // Start learning
        if (!learningStarted) {
            // start learning
            start = new Date();
            /*
            try {
                faceSensor.capture(personDataList.size() - 1);
            } catch (IOException e) {
                logger.error(e.getMessage());
                return tokenError;
            }*/
            learningStarted = true;
            say(STATE_INTRO3, false);
            return ExitToken.loop(TIME_TO_SLEEP);

        } else {
            // check if learning time has not elapsed
            if ((new Date().getTime() - start.getTime()) < TIME_TO_LEARN) {
                return ExitToken.loop(TIME_TO_SLEEP);
            }

            return tokenSuccess;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        /*
        try {
            faceSensor.idle();
            say(STATE_FINISHED, true);
        } catch (IOException e) {
            logger.fatal(e.getMessage());
            return ExitToken.fatal();
        }*/
        return curToken;
    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     * @param async if <code>true</code>, the method call will return as fast as
     * possible, blocks otherwise
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
