package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The robot adjust his angle a little bit (angleIncrement) to left and right and writes the angle into a slot.
 *
 * @author climber
 */
public class AdjustAngleIncremental extends AbstractSkill {

    private SpeechActuator speechActuator;

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessMaxTriesReached;
    private ExitToken tokenError;
    private static final String KEY_ANGLE = "#_ANGLE";

    private double angleIncrement = 0.2;

    private MemorySlot<String> angleAdjustSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        angleIncrement = configurator.requestOptionalDouble(KEY_ANGLE, angleIncrement);

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        angleAdjustSlot = configurator.getSlot("angleAdjustSlot", String.class);
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        String angle = "";
        try {
            angle = angleAdjustSlot.recall();
        } catch (CommunicationException ex) {
            Logger.getLogger(AdjustAngleIncremental.class.getName()).log(Level.SEVERE, null, ex);
        }

        if (angle == null) {
            angle = "0";
        }

        double ang = 0;
        try {
            ang = Double.valueOf(angle);
        } catch (NumberFormatException ex) {
            logger.debug("AdjustAngleIncremental: angle was set to 0");
            ang = 0;
        }

        if (ang < 0) {
            ang = -ang + angleIncrement;
        } else {
            ang = -ang - angleIncrement;
        }

        logger.debug("AdjustAngleIncremental: adjust ANGLE to " + ang);
        try {
            angleAdjustSlot.memorize(String.valueOf(ang));
        } catch (CommunicationException e) {
            logger.error("Cannot communicate with memory: " + e.getMessage());
            logger.debug("Cannot communicate with memory: " + e.getMessage(), e);
            return tokenError;
        }

        NavigationGoalData ngd = new NavigationGoalData();
        ngd.setFrameId(NavigationGoalData.ReferenceFrame.LOCAL);
        ngd.setX(0, LengthUnit.METER);
        ngd.setY(0, LengthUnit.METER);
        ngd.setYaw(ang, AngleUnit.RADIAN);

        try {

            navigationGoalDataSlot.memorize(ngd);
        } catch (CommunicationException e) {
            logger.error("Cannot communicate with memory: " + e.getMessage());
            logger.debug("Cannot communicate with memory: " + e.getMessage(), e);
            return tokenError;
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
