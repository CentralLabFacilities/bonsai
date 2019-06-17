package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.HandOverActuator;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;


/**
 * Waits until a force greater than the given threshold is detected at the gripper.
 *
 * <pre>
 * Options:
 *  #_THRESHOLD:    [double] Optional (default: 2)
 *                      -> Threshold to distinguish noise
 *  #_TIMEOUT:      [long] Optional (default: -1)
 *                      -> Maximum waiting time
 *
 * Slots:
 *
 * ExitTokens:
 *  success:            A force greater than the treshold was detetected
 *  success.timeout:    No force was detected during the timeout time
 *  error:              Waiting for force failed
 *
 * Actuators:
 *  Handover: [HandOverActuator]
 *      -> Called to measure the force at the gripper
 *
 * Sensors:
 *
 * </pre>
 *
 *  @author tmarkmann
 */
public class WaitForForce extends AbstractSkill {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_THRESHOLD = "#_THRESHOLD";

    private long timeout = -1;
    private double threshold = 2;

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessPsTimeout;
    private ExitToken tokenError;

    private HandOverActuator hand;

    private Future<Boolean> future;
    private String group = "not relevant";

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        hand = configurator.getActuator("HandOver", HandOverActuator.class);

        threshold = configurator.requestOptionalDouble(KEY_THRESHOLD, threshold);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)timeout);

        if (timeout > 0) {
            tokenSuccessPsTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {

        if (timeout > 0) {
            logger.debug("using timeout of " + timeout + "ms");
            timeout += Time.currentTimeMillis();
        }

        try {
            future = hand.checkForce(group, (float)threshold);
        } catch (IOException e) {
            logger.error("Cannot initiate checkForce of the HandOverActuator");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (timeout > 0) {
            if (Time.currentTimeMillis() > timeout) {
                logger.info("WaitForForce timed out");
                future.cancel(true);

                return tokenSuccessPsTimeout;
            }
        }

        while (!future.isDone()) {
            logger.info("##### waiting for force torque above threshold...");
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
