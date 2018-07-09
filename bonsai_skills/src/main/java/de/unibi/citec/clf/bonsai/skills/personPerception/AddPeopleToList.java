package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

/**
 * Adds persondata from a list to a list of persondata (use for gathering persondata from more than one person)
 * Has no way to check for double detections, so responsibility for usage is to make sure to not have same persons in the view of the camera when generating the perceptions
 *
 * Possible TODO: compare position of people after merge and delete person percepts that are too close and are expected to belong to the same person
 *
 * @author pvonneumanncosel
 */
public class AddPeopleToList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> newPersonDataListReadSlot;
    private MemorySlotReader<PersonDataList> personDataListReadSlot;
    private MemorySlotWriter<PersonDataList> personDataListWriteSlot;

    private PersonDataList newPersonDataList;
    private PersonDataList personDataList;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        newPersonDataListReadSlot = configurator.getReadSlot("NewPersonDataListReadSlot", PersonDataList.class);
        personDataListReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataListWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
    }

    @Override
    public boolean init() {
        try {
            newPersonDataList = newPersonDataListReadSlot.recall();
            personDataList = personDataListReadSlot.recall();

        } catch (CommunicationException ex) {
            logger.error(ex.getMessage());
            return false;
        }

        if (newPersonDataList == null) {
            logger.error("no persondata recognized before, nothing to be done");
            newPersonDataList = new PersonDataList();
        }

        if (personDataList == null) {
            logger.debug("no persondata in goal slots, creating empty list");
            personDataList = new PersonDataList();
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        personDataList.addAll(newPersonDataList);
        logger.debug("added " + newPersonDataList.size() + " new persons to personlist, new number of persons: " + personDataList.size());
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
