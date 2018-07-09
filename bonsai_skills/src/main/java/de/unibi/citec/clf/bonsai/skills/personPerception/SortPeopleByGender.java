package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;


/**
 * This Skill is used to sort people in a given PersonDataList in regards to the given gender in a way that the person with that gender are in the beginning of the list.
 * <pre>
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class SortPeopleByGender extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<String> genderSlot;
    private MemorySlotReader<PersonDataList> personDataListReadSlot;
    private MemorySlotWriter<PersonDataList> personDataListWriteSlot;

    private PersonDataList personDataList;
    private PersonDataList newPersonDataList;
    private String gender;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        genderSlot = configurator.getReadSlot("GenderSlot", String.class);
        personDataListReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataListWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
    }

    @Override
    public boolean init() {
        newPersonDataList = new PersonDataList();
        try {
            personDataList = personDataListReadSlot.recall();
            if (personDataList == null) {
                logger.error("your PersonDataListSlot was empty, creating empty person data list");
                personDataList = new PersonDataList();
                return true;
            }
            gender = genderSlot.recall();
            if (gender == null) {
                logger.error("your gender was empty, not sorting");
                gender = "";
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
        if(gender.toLowerCase().equals("unknown") || gender.equals("")){
            logger.info("No gender given, not sorting anything: ");
            newPersonDataList = personDataList;
            return tokenSuccess;
        }
        logger.info("sorting by gender now " + gender);
        for(PersonData personData : personDataList){
            if(personData.getPersonAttribute().getGender().getGenderName().toLowerCase().equals(gender.toLowerCase())){
                newPersonDataList.add(personData);
                personDataList.remove(personData);
            }
        }
        newPersonDataList.addAll(personDataList);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataListWriteSlot.memorize(newPersonDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize new sorted person list");
                return tokenError;
            }
        }
        return curToken;
    }
}
