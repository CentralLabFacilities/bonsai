package de.unibi.citec.clf.bonsai.test.skills;

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

/**
 * Dummy state for NoOperation.
 *
 * !!! DO NOT REMOVE !!!!
 *
 * @author kharmening
 */
public class Nop extends AbstractSkill {

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
