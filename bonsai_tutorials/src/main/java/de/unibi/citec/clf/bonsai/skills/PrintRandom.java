package de.unibi.citec.clf.bonsai.skills;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

import java.io.IOException;

public class PrintRandom extends AbstractSkill {

    private static final String KEY_BAR = "#_BAR";

    ExitToken tokenSuccessFoo;

    String bar = "";

    StringActuator actuator;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        // Request used exit states
        tokenSuccessFoo = configurator.requestExitToken(ExitStatus.SUCCESS().ps("foo"));

        // Request parameter
        bar = configurator.requestOptionalValue(KEY_BAR,bar);

        // Fetch actuator from config
        actuator = configurator.getActuator("RepeatPrinter", StringActuator.class);

    }

    @Override
    public boolean init() {
        if(bar.equals("baz"))
            return true;
        else {
            logger.error("bar has to be baz");
            return false;
        }
    }

    @Override
    public ExitToken execute() {

        //Call Actuator
        try {
            actuator.sendString(bar);
        } catch (IOException e) {
            logger.fatal(e);
            return ExitToken.fatal();
        }

        return tokenSuccessFoo;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
    
}
