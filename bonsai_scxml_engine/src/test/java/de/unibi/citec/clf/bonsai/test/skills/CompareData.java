package de.unibi.citec.clf.bonsai.test.skills;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Compare data
 *
 * <pre>
 *
 * Options:
 *  data1: [String] [Read]
 *      -> Memory slot the content will be read from
 *  data2: [String] [Read]
 *      -> Memory slot the content will be read from
 *
 * ExitTokens:
 *  success.match:      Entries are the same
 *  success.mismatch:   Entries are not the same
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class CompareData extends AbstractSkill {

    private ExitToken tokenMisMatch;
    private ExitToken tokenMatch;


    String data1;
    String data2;

    private String slotContentOne;
    private String slotContentTwo;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("match"));
        tokenMisMatch = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("misMatch"));

        data1 = configurator.requestValue("data1");
        data2 = configurator.requestValue("data2");
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        if (data1.equals(data2)) {
            return tokenMatch;
        }
        return tokenMisMatch;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
