package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.GuidingActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Created by llach on 30.03.17.
 */
public class Guiding extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
 
    private GuidingActuator guide;

    private Future<Boolean> future;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        guide = configurator.getActuator("Guiding", GuidingActuator.class);
    }

    @Override
    public boolean init() {

        try {
            logger.debug("starting guiding ...");
            future = guide.startGuiding();

        } catch (IOException e) {
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        while (!future.isDone()) {
            logger.debug("##### guiding running...");
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
        try {
            guide.stopGuiding();
        } catch (IOException ex) {
            logger.error(ex.getMessage());
        }
        return curToken;
    }

}
