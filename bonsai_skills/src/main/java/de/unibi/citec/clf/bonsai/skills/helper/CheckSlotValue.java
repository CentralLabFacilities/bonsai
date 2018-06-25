package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 *
 * @author nils
 */
public class CheckSlotValue extends AbstractSkill {

    static final String KEY_MESSAGE1 = "#_MSG1";
    static final String KEY_MESSAGE2 = "#_MSG2";

    String msg1 = "";
    String msg2 = "";
    String msg;

    private MemorySlot<String> msgSlot;

    private ExitToken tokenMsg1;
    private ExitToken tokenMsg2;
    private ExitToken tokenwrong;

    @Override
    public void configure(ISkillConfigurator configurator) {

        msg1 = configurator.requestOptionalValue(KEY_MESSAGE1, msg1);
        msg2 = configurator.requestOptionalValue(KEY_MESSAGE2, msg2);

        tokenMsg1 = configurator.requestExitToken(ExitStatus.SUCCESS().ps(msg1));
        tokenMsg2 = configurator.requestExitToken(ExitStatus.SUCCESS().ps(msg2));
        tokenwrong = configurator.requestExitToken(ExitStatus.ERROR().ps("wrongstring"));
        msgSlot = configurator.getSlot("String", String.class);

    }

    @Override
    public boolean init() {
        try {
            msg = msgSlot.recall();
        } catch (CommunicationException e) {
            logger.fatal(e);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        if (msg == null ? msg1 == null : msg.equals(msg1)) {
            return tokenMsg1;
        }
        if (msg == null ? msg2 == null : msg.equals(msg2)) {
            return tokenMsg2;
        }
        return tokenwrong;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
