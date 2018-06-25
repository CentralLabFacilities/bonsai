package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.grasp.RobotType;

/**
 *
 *
 * @author lruegeme
 *
 */
public class CheckRobotType extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessBiron;
    private ExitToken tokenSuccessMeka;
    private ExitToken tokenSuccessPepper;

    private RobotType t = null;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessBiron = configurator.requestExitToken(ExitStatus.SUCCESS().ps("biron"));
        tokenSuccessMeka = configurator.requestExitToken(ExitStatus.SUCCESS().ps("meka"));
        tokenSuccessPepper = configurator.requestExitToken(ExitStatus.SUCCESS().ps("pepper"));
    }

    @Override
    public boolean init() {
        t = RobotType.readFromEnv();

        return true;
    }

    @Override
    public ExitToken execute() {
        if (t == null) {
            logger.fatal("robot type failed, aassume biron");
            return tokenSuccessBiron;
        }
        logger.debug("robot type returned " + t.toString());

        switch (t.type) {
            case MEKA:
                return tokenSuccessMeka;
            case PEPPER:
                return tokenSuccessPepper;
            default:
                return tokenSuccessBiron;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
