package de.unibi.citec.clf.bonsai.test.skills;

import de.unibi.citec.clf.bonsai.engine.SkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

public class CheckOptionalDatamodel extends AbstractSkill {


    boolean conf;
    ExitToken exitToken;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        conf = configurator.requestOptionalBool("SUCCESS", false);
        if (((SkillConfigurator)configurator).getPhase() == SkillConfigurator.SkillConfigurationPhase.OBJECT)
            System.out.println("configured " + conf);
        exitToken = configurator.requestExitToken(ExitStatus.SUCCESS());
    }

    @Override
    public boolean init() {
        return conf;
    }

    @Override
    public ExitToken execute() {
        return  exitToken;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
