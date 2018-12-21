package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

/**
 * @author lruegeme
 */
public class WriteReadStringSlotSkill extends AbstractSkill {

    MemorySlotReader<String> readSlot;
    MemorySlotWriter<String> writeSlot;

    private ExitToken tokenSuccess;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        readSlot = configurator.getReadSlot("TestListSlot", String.class);
        writeSlot = configurator.getWriteSlot("TestListSlot", String.class);

    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            writeSlot.memorize("Hello");
            String hello = readSlot.recall();
            if (hello.equals("Hello")) return tokenSuccess;
        } catch (CommunicationException ex) {
            return ExitToken.fatal();
        }

        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
