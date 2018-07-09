package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

/**
 * creates an empty personDataList and saves it in the slot
 * I know this is borderline retarded but it is needed
 *
 * @author pvonneumanncosel
 */
public class EmptyPeopleListSlot extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<PersonDataList> personDataListSlot;

    private PersonDataList personDataList;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);
    }

    @Override
    public boolean init() {
        personDataList = new PersonDataList();
        return true;
    }

    @Override
    public ExitToken execute() { return tokenSuccess; }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccess)) {
            try {
                personDataListSlot.memorize(personDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not save person data list");
                return tokenError;
            }
        }
        return tokenSuccess;
    }
}
