package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.person.PersonDataList;


/**
 * This Skill is used to retrieve the amount of people in a given PersonDataList.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataListSlot: [PersonDataList] [Read]
 *      -> Memory slot with the list of PersonData to count
 *  CountSlot: [String] [Write]
 *      -> Memory slot with number of PersonData in the list
 *
 * ExitTokens:
 *  success:                Number of the PersonData's successfully retrieved
 *  error:                  Number of the PersonData's could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class CountPeople extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataListSlot;
    private MemorySlotWriter<String> counterSlot;

    private PersonDataList personDataList;
    private String counter;


    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListSlot = configurator.getReadSlot("PersonDataListSlot", PersonDataList.class);
        counterSlot = configurator.getWriteSlot("CountSlot", String.class);

    }

    @Override
    public boolean init() {
        try {
            personDataList = personDataListSlot.recall();

            if (personDataList == null) {
                logger.error("your PersonDataListSlot was empty, creating empty person data list");
                personDataList = new PersonDataList();
                return true;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        int size = personDataList.size();
        counter = "" + size;
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                counterSlot.memorize(counter);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize counter");
                return tokenError;
            }
        }
        return curToken;
    }
}
