package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.TrackingActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;


/**
 * StopTracking
 *
 * <pre>
 *
 * ExitTokens:
 *  error:      cant reach actuator
 *  success:    all good (all fine)
 *
 * Actuators:
 *  TrackingActuator: [TrackingActuator]
 *      -> Called to stop tracking
 *
 * </pre>
 *
 *
 * @author pvonneumanncosel
 */
public class StopPeopleTracking extends AbstractSkill {
    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    private TrackingActuator trackingActuator;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        trackingActuator = configurator.getActuator("TrackingActuator", TrackingActuator.class);
    }

    @Override
    public boolean init() {
        trackingActuator.stopTracking();
        return true;
    }

    @Override
    public ExitToken execute() { return tokenSuccess; }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
