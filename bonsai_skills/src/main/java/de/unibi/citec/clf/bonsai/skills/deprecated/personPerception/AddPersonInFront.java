package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.io.IOException;

/**
 * This state will add a new person to a PersonDataList. name can be assigned with param #_NAME else "Operator" is used
 *
 * WARNING: using supplied id. Id can change if person leaves tracking use personId with caution. FaceId is better for
 * long term tracking
 *
 * @author mzeunert,lruegeme
 */
public class AddPersonInFront extends AbstractSkill {

    private static final String KEY_NAME = "#_NAME";

    //defaults
    private String name = "Operator";

    private MemorySlot<PersonDataList> knownPersonsMemorySlot;
    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    // used tokens
    private ExitToken tokenSuccess;

    private PersonDataList personDataList;
    private PositionData robot;
    private PersonData personToLearn;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        knownPersonsMemorySlot = configurator.getSlot("KnownPersonsSlot", PersonDataList.class);

        name = configurator.requestOptionalValue(KEY_NAME, name);

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

        return true;
    }

    @Override
    public ExitToken execute() {
        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {

            personToLearn.setName(name);
            personToLearn.setPosition(robot);
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

        return curToken;

    }
}
