package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.person.PersonData;

/**
 * This Skill is used for retrieving the PositionData of a Person.
 * <pre>
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
@Deprecated
public class GetPersonPosition extends AbstractSkill{

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonData> personDataSlot;
    private MemorySlotWriter<Pose2D> positionDataSlot;

    private PersonData personData;
    private Pose2D pose2D;


    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS(),
                "PositionData of the PersonData successfully retrieved");
        tokenError = configurator.requestExitToken(ExitStatus.ERROR(),
                "PositionData of the PersonData could not be retrieved");

        personDataSlot = configurator.getReadSlot("PersonDataSlot", PersonData.class,
                "Memory slot the person is contained in");
        positionDataSlot = configurator.getWriteSlot("PositionDataSlot", Pose2D.class,
                "Memory slot with the position of the person");
    }

    @Override
    public boolean init() {
        try {
            personData = personDataSlot.recall();

            if (personData == null) {
                logger.error("your PersonDataSlot was empty");
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
        pose2D = personData.getPosition();
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                positionDataSlot.memorize(pose2D);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize positionData");
                return tokenError;
            }
        }
        return curToken;
    }
}
