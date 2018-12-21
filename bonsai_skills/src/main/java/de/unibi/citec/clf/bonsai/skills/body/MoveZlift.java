package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
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
 * change the zlift position.
 *
 * TODO: unmekafy
 * 
 * @author llach
 */
public class MoveZlift extends AbstractSkill {

    private static final String KEY_POSITION = "#_POSITION";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_SLOT = "#_SLOT";

    private JointControllerActuator jointcontroller;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private float pos;
    private long timeout = 7000;
    private float height;
    Future<Boolean> b;

    private MemorySlot<Double> heightSlot;
    private Boolean readHeightSlot;

    @Override

    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        jointcontroller = configurator.getActuator("MekaJointActuator", JointControllerActuator.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        readHeightSlot = configurator.requestOptionalBool(KEY_SLOT, false);

        if (readHeightSlot) {
            heightSlot = configurator.getSlot("ZLiftHeight", Double.class);
        } else {
            pos = (float) configurator.requestDouble(KEY_POSITION);
        }

    }

    @Override
    public boolean init() {

        if (readHeightSlot) {

            try {
                height = (float) (double) heightSlot.recall();
            } catch (CommunicationException | NumberFormatException ex) {
                Logger.getLogger(MoveZlift.class.getName()).log(Level.SEVERE, null, ex);
            }
            logger.error("height: " + height);
            if (height > 0.15 && height < 0.5) {
                pos = height;
            }
        }

        try {
            b = jointcontroller.goToZliftHeight(pos);
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
