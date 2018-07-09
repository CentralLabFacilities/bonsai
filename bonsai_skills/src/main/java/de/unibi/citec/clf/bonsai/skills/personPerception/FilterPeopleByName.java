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
 * This skill filteres a list of persons by their name
 * If no person with that name in list, the result slot remains untouched.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataListReadSlot: [PersonDataList] [Read]
 *      -> Memory slot persondataList to read
 *  StringSlot: [String] [Read]
 *      -> Memory slot name to compare
 *  PersonDataListWriteSlot: [PersonDataList] [Write]
 *      -> Memory slot persondata to write result
 *
 *
 * ExitTokens:
 *  success.nameInList:                  There has been at least one persondata containing the name (comparision ignores lower and upper chars)
 *  success.nameNotInList:               There has been no persondata containing the name  (comparision ignores lower and upper chars)
 *  error:                               Something went wrong, cant memorize persondata
 *  fatal:                               Something went wrong, no persondataList in slot or no string in name slot or something else during runtime
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class FilterPeopleByName extends AbstractSkill {

    private ExitToken tokenSuccessInList;
    private ExitToken tokenSuccessNotInList;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataListReadSlot;
    private MemorySlotWriter<PersonDataList> personDataListWriteSlot;
    private MemorySlotReader<String>         nameSlot;

    private PersonDataList personDataList;
    private PersonDataList resultPersonDataList;
    private String name;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccessInList       = configurator.requestExitToken(ExitStatus.SUCCESS().ps("inList"));
        tokenSuccessNotInList    = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notInList"));
        tokenError               = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListReadSlot            = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        nameSlot                          = configurator.getReadSlot("StringSlot", String.class);
        personDataListWriteSlot           = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
    }

    @Override
    public boolean init() {
        resultPersonDataList = new PersonDataList();
        try {
            personDataList = personDataListReadSlot.recall();
            if (personDataList == null) {
                logger.error("your PersonDatalistSlot was empty");
                return false;
            }
            name = nameSlot.recall();
            if (name == null) {
                logger.error("your name slot was empty");
                return false;
            }
        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        name = name.toLowerCase();
        if(name.equals("")){
            logger.info("NAME HAS NO CONTENT - NOT CHECKING IF PERSONS HAVE EMPTY NAME");
            return tokenSuccessNotInList;
        }
        for(PersonData personDataObj: personDataList){
            if(personDataObj.getName().toLowerCase().equals(name)){
                logger.info("Persondata name equals " + name + " - added to list");
                resultPersonDataList.add(personDataObj);
            } else {
                logger.info("Persondata name ("+ personDataObj.getName().toLowerCase() + ") is not equal to " + name);
            }
        }
        logger.info("Number of persons in new list: " + resultPersonDataList.size());
        if(resultPersonDataList != null) {
            if(resultPersonDataList.size() > 0){
                return tokenSuccessInList;
            }
        }
        return tokenSuccessNotInList;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataListWriteSlot.memorize(resultPersonDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize persondatalist");
                return tokenError;
            }
        }
        return curToken;
    }
}
