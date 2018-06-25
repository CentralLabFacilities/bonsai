package de.unibi.citec.clf.bonsai.skills.deprecated.dialog.unsupported;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.io.IOException;
import java.util.Map;

/**
 * This state will add a new person to a PersonDataList and learn its name.
 * 
 * <pre>
 * options:
 *
 * slots:
 * PersonDataList knownPersonsMemorySlot -> the used PersonDataList
 *
 * possible return states are:
 * success -> name learned
 * fatal -> a hard error occurred e.g. Slot communication error.
 *
 * If a PersonDataList has been written to SceneMemory before it will be used. Else
 * it will be created. Id is set to current size of the list.
 * 
 * </pre>
 * 
 * @author mzeunert,lruegeme
 */
public class StoreNewOrderer extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;
    
    private static final String REPEAT_TIME_KEY = "#_REPEAT_AFTER";
    
    // Default values
    private static long repeatTime = 5000L;
    
    /*
     * What the robot will say.
     */
    private static final String SAY_EXIT = "Ok, I will call you %s.";
    
    /*
     * Actuators used by this state.
     */
    private SpeechActuator speechActuator;
    private MemorySlot<PersonDataList> knownPersonsMemorySlot;
    /*
     * Sensors used by this state.
     */
    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private PersonDataList personDataList;
    private PositionData robot;
    private PersonData personToLearn;
    
    private String name = "";


    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        speechActuator = configurator.getActuator("SpeechActuator",
                SpeechActuator.class);
        
        knownPersonsMemorySlot = configurator.getSlot(
                "personDataMemorySlot", PersonDataList.class);
        
        repeatTime = configurator.requestOptionalInt(REPEAT_TIME_KEY, (int) repeatTime);
        
    }

    @Override
    public boolean init() {

        try { 
            robot = positionSensor.readLast(100);
        } catch (IOException | InterruptedException ex) {
           logger.error("robot pos could not be read");
           return false;
        }
        
        try {
            personDataList = knownPersonsMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not load personDataList");
            return false;
        }

        if (personDataList == null) {
            personDataList = new PersonDataList();
            logger.debug("personDataList was null, new personDataList created");
        }

        personToLearn = PersonHelper.getNextPersonInFront(personSensor, positionSensor);
        if (personToLearn == null) {
            logger.fatal("personToLearn was null");
            return false;
        }

        // set id
        logger.debug("personDataList.size = " + personDataList.size());
        /* unsupported
         * personToLearn.setId(personDataList.size());
         */

        
        
        return true;
    }

    @Override
    public ExitToken execute() {

        int count = personDataList.size() + 1;
        name = "Jenny " + count;

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (name.isEmpty()) {
            logger.error("name not set");
            return tokenError;
        }
        
        say(String.format(SAY_EXIT, name).replaceAll("the", ""));

        personToLearn.setName(name);
        personToLearn.setPosition(robot);
        //unsupported personToLearnpersonToLearn.setPoi(true);
        logger.info("Add person to list: " + personToLearn);
        personDataList.add(personToLearn);

        try {
            knownPersonsMemorySlot.memorize(personDataList);
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
