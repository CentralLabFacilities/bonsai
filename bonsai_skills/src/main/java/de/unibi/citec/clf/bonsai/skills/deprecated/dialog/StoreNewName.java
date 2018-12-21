package de.unibi.citec.clf.bonsai.skills.deprecated.dialog;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.bonsai.util.helper.SimpleSpeechHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Set;

/**
 * This state will add a new person to a PersonDataList and learn its name.
 *
 * <pre>
 * options:
 * (optional) #_REPEAT_AFTER(ms) -> repeats questions after x (default 3000)
 *
 * slots:
 * PersonDataList knownPersonsMemorySlot -> the used PersonDataList
 *
 * possible return states are:
 * success -> name learned
 * error -> no person is standing in front of the robot.
 * fatal -> a hard error occurred e.g. Slot communication error.
 *
 * If a PersonDataList has been written to SceneMemory before it will be used. Else
 * it will be created. Id is set to current size of the list.
 *
 * </pre>
 *
 * @author mzeunert,lruegeme
 */
public class StoreNewName extends AbstractSkill {

    private static final String REPEAT_TIME_KEY = "#_REPEAT_AFTER";
    private static final String KEY_NAME = "#_SAVENAME";
    private static final String KEY_MAX_TRIES = "#MAXTRIES";

    //Defaults
    private static long repeatTime = 5000L;
    private static int MAX_TRIES = 5;
    private boolean storeName = false;

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    /*
     * What the robot will say.
     */
    private static final String SAY_ASK_FOR_NAME = "What is your name?";
    private static final String SAY_ASK_FOR_NAME_TIMEOUT = "I did not understand your name, please come closer and repeat your name";
    private static final String SAY_REPEAT_NAME = "Please repeat your name!";
    private static final String SAY_EXIT = "Ok, I will call you %s.";
    private static final String SAY_UNDERSTOOD_NAME = "Is %s correct?";
    private static final String SAY_UNDERSTOOD_NAME_TIMEOUT = "I did not hear you, please come closer. Is %s correct?";

    /*
     * Actuators used by this state.
     */
    private SpeechActuator speechActuator;
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;
    private MemorySlot<String> nameSlot;
    /*
     * Sensors used by this state.
     */
    private Sensor<PersonDataList> personSensor;
    private Sensor<Utterance> speechSensorName;
    private Sensor<Utterance> speechSensorConfirm;
    private Sensor<PositionData> positionSensor;

    private List<PersonData> personDataList;
    private PositionData robot;
    private PersonData personToLearn;

    /**
     * Speechmanager
     */
    private SimpleSpeechHelper speechHelperName;
    private SimpleSpeechHelper speechHelperConfirm;

    private String name = "";
    private boolean askedForName = false;
    private int tries = 0;
    private long lastRepeat = 0;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        speechSensorName = configurator.getSensor("SpeechSensorName", Utterance.class);
        speechSensorConfirm = configurator.getSensor("SpeechSensorConfirm", Utterance.class);

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        knownPersonsMemorySlot = configurator.getSlot("KnownPersonsSlot", List.getListClass(PersonData.class));
        nameSlot = configurator.getSlot("PersonName", String.class);

        repeatTime = configurator.requestOptionalInt(REPEAT_TIME_KEY, (int) repeatTime);
        storeName = configurator.requestOptionalBool(KEY_NAME, storeName);
        MAX_TRIES = configurator.requestOptionalInt(KEY_MAX_TRIES, MAX_TRIES);

    }

    @Override
    public boolean init() {
        speechHelperName = new SimpleSpeechHelper(speechSensorName, true);
        speechHelperConfirm = new SimpleSpeechHelper(speechSensorConfirm, true);
        try {
            robot = positionSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
            logger.error("robot pos could not be read");
            return false;
        }

        try {
            personDataList = knownPersonsMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not load personDataList", ex);
            return false;
        }

        if (personDataList == null) {
            personDataList = new List<>(PersonData.class);
            logger.debug("personDataList was null, new personDataList created");
        }

        personToLearn = PersonHelper.getNextPersonInFront(personSensor, positionSensor);
        if (personToLearn == null) {
            logger.fatal("personToLearn was null");
            return false;
        }

        // set id
        logger.debug("personDataList.size = " + personDataList.size());
        //personToLearn.setId(personDataList.size());

        return true;
    }

    @Override
    public ExitToken execute() {

        if (!askedForName) {
            say(SAY_ASK_FOR_NAME);
            askedForName = true;
            lastRepeat = Time.currentTimeMillis();
            speechHelperName.startListening();
        }

        if (name.isEmpty()) {
            if (!speechHelperName.hasNewUnderstanding()) {
                if (Time.currentTimeMillis() - lastRepeat > repeatTime) {
                    say(String.format(SAY_ASK_FOR_NAME_TIMEOUT, name));
                    lastRepeat = Time.currentTimeMillis();
                }
                return ExitToken.loop();
            }

            Set<String> understoodNames_set = speechHelperName.getUnderstoodWords(name);
            java.util.List<String> understoodNames = new ArrayList<>(understoodNames_set);
            if (understoodNames.isEmpty()) {
                logger.warn("understood utterance is not a name");
                return ExitToken.loop();
            }

            // has understood name
            tries++;
            name = understoodNames.get(0);
            if (tries < MAX_TRIES) {
                say(String.format(SAY_UNDERSTOOD_NAME, name));
                lastRepeat = Time.currentTimeMillis();
                speechHelperConfirm.startListening();
            } else {
                // force this name
                return tokenSuccess;
            }

        } else {
            // wait for confirmation of understood name

            if (!speechHelperConfirm.hasNewUnderstanding()) {
                if (Time.currentTimeMillis() - lastRepeat > repeatTime) {
                    say(String.format(SAY_UNDERSTOOD_NAME_TIMEOUT, name));
                    lastRepeat = Time.currentTimeMillis();
                }
                return ExitToken.loop();
            }

            if (!speechHelperConfirm.getUnderstoodWords("confirm_yes").isEmpty()) {
                return tokenSuccess;
            } else if (!speechHelperConfirm.getUnderstoodWords("confirm_no").isEmpty()) {
                name = "";
                lastRepeat = Time.currentTimeMillis();
                say(SAY_REPEAT_NAME);
                speechHelperName.startListening();

            }
        }

        return ExitToken.loop();

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        speechHelperName.removeHelper();
        speechHelperConfirm.removeHelper();

        if (name.isEmpty()) {
            logger.error("name not set");
            return tokenError;
        }

        say(String.format(SAY_EXIT, name));

        personToLearn.setName(name);
        personToLearn.setPosition(robot);
        logger.info("Add person to list: " + personToLearn);
        personDataList.add(personToLearn);

        try {
            knownPersonsMemorySlot.memorize(personDataList);
            if (storeName) {
                nameSlot.memorize(name);
            }
            return curToken;
        } catch (CommunicationException ex) {
            logger.error("Memory Exception");
            return ExitToken.fatal();
        }

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
