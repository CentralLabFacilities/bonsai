package de.unibi.citec.clf.bonsai.skills.arm;



import de.unibi.citec.clf.bonsai.actuators.HandShakeActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;

/**
 *
 * why is this a "csra" skill?
 * 
 * @author lruegeme
 *
 */
public class ShakeHand extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private HandShakeActuator hand;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        hand = configurator.getActuator("HandShaker", HandShakeActuator.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            hand.simpleShakeHand();
        } catch (IOException e) {
            return ExitToken.fatal();
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
       return curToken;
    }
}
