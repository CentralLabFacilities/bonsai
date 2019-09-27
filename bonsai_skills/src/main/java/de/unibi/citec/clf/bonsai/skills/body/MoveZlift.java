package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Change the zlift position.
 *
 * <pre>
 *
 * Options:
 *  #_POSITION:      [Double] Optional (Default: 0)
 *                      -> Z lift position, range depending on the robot (Tiago: 0.0-0.35)
 *  #_MOVE_DURATION: [Integer] Optional (Default: 4000)
 *                      -> Time the lift takes to move to the position in milliseconds
 *  #_TIMEOUT:       [Integer] Optional (default: 7000)
 *                      -> Amount of time robot waits for actuator to be done in milliseconds
 *  #_SLOT:          [boolean] Optional (default: false)
 *                      -> If true the position is read from a slot
 *
 * Slots:
 *
 * ExitTokens:
 *  success:    Head movement completed successfully
 *  error
 *
 * Sensors:
 *
 * Actuators:
 *  ZliftActuator
 *
 * </pre>
 *
 * TODO: unmekafy
 * 
 * @author llach
 */
public class MoveZlift extends AbstractSkill {

    private static final String KEY_POSITION = "#_POSITION";
    private static final String KEY_MOVE_DURATION = "#_MOVE_DURATION";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_SLOT = "#_SLOT";

    private JointControllerActuator jointcontroller;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private float pos;
    private int move_duration = 4000;
    private long timeout = 7000;
    private Future<Boolean> b;

    private MemorySlotReader<Double> heightSlot;
    private Boolean readHeightSlot;

    @Override

    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        jointcontroller = configurator.getActuator("ZLiftActuator", JointControllerActuator.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        move_duration = configurator.requestOptionalInt(KEY_MOVE_DURATION, move_duration);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        readHeightSlot = configurator.requestOptionalBool(KEY_SLOT, false);

        if (readHeightSlot) {
            //heightSlot = configurator.getSlot("ZLiftHeight", Double.class);
            heightSlot = configurator.getReadSlot("ZLiftHeight", Double.class);
        } else {
            pos = (float) configurator.requestDouble(KEY_POSITION);
        }

    }

    @Override
    public boolean init() {

        if (readHeightSlot) {

            try {
                pos = (float) (double) heightSlot.recall();
            } catch (CommunicationException | NumberFormatException ex) {
                Logger.getLogger(MoveZlift.class.getName()).log(Level.SEVERE, null, ex);
            }
        }

        try {
            b = jointcontroller.moveTo(pos, 1000.0f/move_duration);
        } catch (IOException ex) {
            logger.error(ex);
            return false;
        }

        if (timeout > 0) {
            timeout += Time.currentTimeMillis();
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        if (!b.isDone()) {
            if (timeout > 0 && timeout < Time.currentTimeMillis()) {
                return tokenError;
            }
            return ExitToken.loop(50);
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
