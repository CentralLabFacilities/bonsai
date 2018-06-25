package de.unibi.citec.clf.bonsai.skills.deprecated.csra;


import de.unibi.citec.clf.bonsai.actuators.HandShakeActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * 
 * why is this a "csra" skill?
 * 
 * @author lruegeme
 */
public class ShakeHandAction extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private HandShakeActuator hand;

    private Future<Boolean> future;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        hand = configurator.getActuator("HandShaker", HandShakeActuator.class);
    }

    @Override
    public boolean init() {

        try {
            future = hand.shakeHand();
        } catch (IOException e) {
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        while (!future.isDone()) {
            logger.info("##### hand shake running...");
            return ExitToken.loop(1000);
        }

        try {
            if (future.get()) {
                return tokenSuccess;
            } else {
                return tokenError;
            }
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e.getMessage());
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
