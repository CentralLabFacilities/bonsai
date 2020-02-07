package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.person.PersonData;

/**
 * This skill compares the name field of a person data with a name in a slot and return success.equal if they are same same and success.notEqual if they dont.
 * error if something goes wrong.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataSlot: [PersonData] [Read]
 *      -> Memory slot persondata to read the name from
 *  StringSlot: [String] [Read]
 *      -> Memory slot name to compare
 *
 *
 * ExitTokens:
 *  success.equal:                  The names have been the same (comparision ignores lower and upper chars)
 *  success.notEqual:               The names have not been the same (comparision ignores lower and upper chars)
 *  fatal:                          Something went wrong, no persondata in slot or no string in name slot
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class ComparePersonName extends AbstractSkill {

    private ExitToken tokenSuccessEqual;
    private ExitToken tokenSuccessNotEqual;

    private MemorySlotReader<PersonData> personDataSlot;
    private MemorySlotReader<String>     nameSlot;

    private PersonData personData;
    private String name;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccessEqual       = configurator.requestExitToken(ExitStatus.SUCCESS().ps("equal"));
        tokenSuccessNotEqual    = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notEqual"));

        personDataSlot          = configurator.getReadSlot("PersonDataSlot", PersonData.class);
        nameSlot                = configurator.getReadSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            personData = personDataSlot.recall();
            if (personData == null) {
                logger.error("your PersonDataSlot was empty");
                return false;
            }
            name = nameSlot.recall();
            if (name == null) {
                logger.error("your area slot was empty");
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
        if(personData.getName().toLowerCase().equals(name)){
            logger.info("Persondata name equals " + name);
            return tokenSuccessEqual;
        }
        logger.info("Persondata name ("+ personData.getName().toLowerCase() + ") is not equal to " + name);
        return tokenSuccessNotEqual;
    }

    @Override
    public ExitToken end(ExitToken curToken) { return curToken; }
}
