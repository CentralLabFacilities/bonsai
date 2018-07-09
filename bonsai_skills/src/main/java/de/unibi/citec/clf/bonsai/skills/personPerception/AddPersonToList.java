package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

/**
 * Adds persondata from a slot to a list of persondata (use for gathering persondata from more than one person)
 * Has no way to check for double detections, so responsibility for usage is to make sure to not have same persons in the view of the camera when generating the perceptions
 *
 * @author pvonneumanncosel
 */
public class AddPersonToList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonData> personDataSlot;
    private MemorySlotReader<PersonDataList> personDataListReadSlot;
    private MemorySlotWriter<PersonDataList> personDataListWriteSlot;

    private PersonData personData;
    private PersonDataList personDataList;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataSlot = configurator.getReadSlot("PersonDataSlot", PersonData.class);
        personDataListReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataListWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
    }

    @Override
    public boolean init() {
        try {
            personData = personDataSlot.recall();
            personDataList = personDataListReadSlot.recall();

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (personData == null) {
            logger.error("no persondata recognized before, nothing to be done");
            return false;
        }

        if (personDataList == null) {
            logger.debug("no persondata in goal slots, creating empty list");
            personDataList = new PersonDataList();
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        personDataList.add(personData);
        logger.debug("added a new person to personlist, new number of persons: " + personDataList.size());
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccess)) {
            try {
                personDataListWriteSlot.memorize(personDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not save persondata list");
                return tokenError;
            }
        }
        return tokenSuccess;
    }
}
