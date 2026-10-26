package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * Wait for a specified amount of time.
 *
 * @author lkettenb
 * @author jkummert
 */
public class Wait extends AbstractSkill {

    private static final String DEFAULT_KEY = "#_TIMEOUT";
    private long timeout = 1000;

    private ExitToken tokenSuccess;

    @Override
    public void configure(ISkillConfigurator configurator) {

        timeout = configurator.requestOptionalInt(DEFAULT_KEY, (int)timeout, "How long the skill should wait");
        
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS(), "Successfully waited");
    }

    @Override
    public boolean init() {

        logger.debug("waiting for " + timeout + "ms");
        timeout = Time.currentTimeMillis() + timeout;

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout < Time.currentTimeMillis()) {
            return tokenSuccess;
        }
        return ExitToken.loop(50);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
