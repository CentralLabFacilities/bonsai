package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.Crowd;
import de.unibi.citec.clf.btl.data.person.PersonData;

/**
 * gets a crowd from a slot and builds a string that describes the crowd
 * as to number of people in the crowd and male & female count.
 *
 * <pre>
 * Options:
 *  #_SAY_GENDER: [boolean] Optional (default: true)
 *                 -> whether the robot states male and female count
 *
 * Slots:
 *  CrowdSlot:  [Crowd] [Read]
 *      -> Crowd of recognized people
 *  DescriptionSlot: [String] [Write]
 *      -> String that describes the crowd
 *
 * ExitTokens:
 *  success:    Everything worked according to plan
 *  error.noCrowd: the crowd read from the slot was null
 *
 * </pre>
 *
 * @author jsimmering
 */
public class DescribeCrowd extends AbstractSkill{

    private final static String KEY_SAY_GENDER = "#_SAY_GENDER";

    //defaults
    boolean gender = true;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoCrowd;

    private Crowd crowd;

    private MemorySlotReader<Crowd> crowdSlot;
    private MemorySlotWriter<String> descriptionSlot;

    String description;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoCrowd = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("noCrowd"));

        gender = configurator.requestOptionalBool(KEY_SAY_GENDER, gender);

        // Initialize slots
        crowdSlot = configurator.getReadSlot("CrowdSlot", Crowd.class);
        descriptionSlot = configurator.getWriteSlot("DescriptionSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            crowd = crowdSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read from Crowd slot", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        if (crowd == null) {
            logger.error("Crowd from slot is null");
            return tokenErrorNoCrowd;
        }

        List<PersonData> persons = crowd.getPersons();
        String people = " people";
        if (persons.size() == 1) {
            people = " person";
        }
        int countMale = crowd.getMaleCount(persons);
        int countFemale = crowd.getFemaleCount(persons);

        description = "I see " + crowd.getPersons().size() + people + " " + countFemale + " female and " + countMale + " male.";
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (description != null) {
                try {
                    descriptionSlot.memorize(description);
                } catch (CommunicationException e) {
                    logger.fatal("Unable to write to memory: " + e.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
