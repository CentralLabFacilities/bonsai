package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Set the robot gaze.
 *
 * <pre>
 *
 * Options:
 *  #_HORIZONTAL:   [String] Optional (Default: 0)
 *                      -> Horizontal direction to look to in rad
 *  #_VERTICAL:     [String] Optional (Default: 0)
 *                      -> Vertical direction to look to in rad
 *  #_MOVE_DURATION:[String] Optional (Default: 0)
 *                      -> Time the head takes to move to the position in secs
 *  #_BLOCKING:     [boolean] Optional (default: false)
 *                      -> If true skill ends after head movement was completed
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    Head movement completed successfully
 *
 * Sensors:
 *
 * Actuators:
 *  GazeActuator: [GazeActuator]
 *      -> Used to control the head movement
 *
 * </pre>
 *
 * @author jkummert
 */
public class SetRobotGaze extends AbstractSkill {

    private static final String KEY_HORIZONTAL = "#_HORIZONTAL";
    private static final String KEY_VERTICAL = "#_VERTICAL";
    private static final String KEY_MOVE_DURATION = "#_MOVE_DURATION";
    private static final String KEY_BLOCKING = "#_BLOCKING";

    private double horizontal = Double.MAX_VALUE;
    private double vertical = Double.MAX_VALUE;
    private double move_duration = 0;

    private boolean blocking = false;

    private GazeActuator gazeActuator;

    private ExitToken tokenSuccess;

    private Future<Boolean> gazeStatus;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        horizontal = configurator.requestOptionalDouble(KEY_HORIZONTAL, horizontal);
        vertical = configurator.requestOptionalDouble(KEY_VERTICAL, vertical);
        move_duration = configurator.requestOptionalDouble(KEY_MOVE_DURATION, move_duration);
    }

    @Override
    public boolean init() {
        
        try {
            gazeActuator.manualStop();
        } catch (IOException ex) {
            logger.warn("Could not cancel gaze action goal.");
        }

        if (horizontal == Double.MAX_VALUE && vertical == Double.MAX_VALUE) {
            gazeStatus = gazeActuator.setGazeTargetAsync((float)0.0,(float)0.0,2);
            logger.warn("Don't leave both horizontal and vertical unset, that makes just no sense at all.");
        }
        
        if (horizontal == Double.MAX_VALUE) {
            logger.debug("setting head pitch to: "+vertical+" with duration "+move_duration);
            if (move_duration > 0) {
                gazeStatus = gazeActuator.setGazeTargetPitchAsync((float)vertical, (float)move_duration);
            } else {
                gazeStatus = gazeActuator.setGazeTargetPitchAsync((float)vertical, (float)2.0); //2 is defalt duration for head movement
            }
        } else if (vertical == Double.MAX_VALUE) {
            logger.debug("setting head yaw to: "+horizontal+" with duration "+move_duration);
            if (move_duration > 0) {
                gazeStatus = gazeActuator.setGazeTargetYawAsync((float)horizontal, (float)move_duration);
            } else {
                gazeStatus = gazeActuator.setGazeTargetYawAsync((float)horizontal, (float)2.0); //2 is defalt duration for head movement
            }
        } else {
            logger.debug("setting head pose to: " + vertical + " / " + horizontal + " and with duration: " + move_duration);
            if (move_duration > 0) {
                gazeStatus = gazeActuator.setGazeTargetAsync((float) vertical, (float) horizontal, (float) move_duration);
            } else {
                gazeStatus = gazeActuator.setGazeTargetAsync((float) vertical, (float) horizontal);
            }
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        
        try {
            if ((!gazeStatus.isDone() && !gazeStatus.get()) && blocking) {
                logger.trace("Gaze done: " + gazeStatus.isDone() + " gaze cancelled: " + gazeStatus.isCancelled() + "gaze get: " + gazeStatus.get());
                return ExitToken.loop(10);
            }
        } catch (InterruptedException ex) {
            Logger.getLogger(SetRobotGaze.class.getName()).log(Level.SEVERE, null, ex);
        } catch (ExecutionException ex) {
            Logger.getLogger(SetRobotGaze.class.getName()).log(Level.SEVERE, null, ex);
        }
        

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
