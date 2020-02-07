package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.person.PersonData;

/**
 * Continually turn head towards a person.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read]
 *      -> Read in person to look towards
 *  BlacklistSlot:      [String] [Read & Write]
 *      -> Read in current and save updated blacklist
 *
 * ExitTokens:
 *  success:      person uuid was saved in blacklist
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 *
 * @author dleins
 */
public class AddPersonToBlacklist extends AbstractSkill {

    private ExitToken tokenSuccess;

    private MemorySlotReader<PersonData> targetPersonSlot;
    private MemorySlotReader<String> blacklistSlot;
    private MemorySlotWriter<String> updatedBlacklistSlot;

    private String targetID;
    private String blacklist;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        targetPersonSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);
        blacklistSlot = configurator.getReadSlot("BlacklistSlot", String.class);
        updatedBlacklistSlot = configurator.getWriteSlot("BlacklistSlot", String.class);
    }

    @Override
    public boolean init() {

        try {
            targetID = targetPersonSlot.recall().getUuid();
        } catch (CommunicationException ex) {
            logger.warn("Could not read target id from slot.", ex);
            return false;
        }

        try {
            blacklist = blacklistSlot.recall();
        } catch (CommunicationException e) {
            logger.warn("Could not read blacklist from slot");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        blacklist = blacklist+";"+targetID;
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        try {
            updatedBlacklistSlot.memorize(blacklist);
        } catch (CommunicationException e) {
            logger.warn("Could not memorize uuid in slot");
            return ExitToken.fatal();
        }

        return curToken;
    }
}
