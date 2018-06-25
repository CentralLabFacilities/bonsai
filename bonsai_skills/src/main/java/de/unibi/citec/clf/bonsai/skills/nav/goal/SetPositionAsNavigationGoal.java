package de.unibi.citec.clf.bonsai.skills.nav.goal;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Set a navigation goal based on a map position.
 *
 * <pre>
 *
 * Options:
 *  #_X:    [double] Optional (default: NaN)
 *              -> Map position x in m
 *  #_Y:    [double] Optional (default: NaN)
 *              -> Map position y in m
 *  #_YAW   [double] Optional (default: NaN)
 *              -> Map position yaw in rad
 *
 * Slots:
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> The navigation goal based on the given position
 *  PositionDataSlot:       [PositionData] [Read]
 *      -> If either #_X, #_Y or #_YAW is not set use this slot to set navigation goal
 *
 * ExitTokens:
 *  success:    Navigation goal computed and stored successfully
 *  error:      Navigation goal could not be computed or saved
 *
 * Sensors:
 *
 * Actuators:
 *
 * </pre>
 *
 * @author cklarhorst
 */
public class SetPositionAsNavigationGoal extends AbstractSkill {

    private static final String KEY_X = "#_X";
    private static final String KEY_Y = "#_Y";
    private static final String KEY_YAW = "#_YAW";

    private double x = Double.NaN;
    private double y = Double.NaN;
    private double yaw = Double.NaN;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PositionData> positionSlot;
    private MemorySlotWriter<NavigationGoalData> navigationMemorySlot;

    private PositionData posData;
    private NavigationGoalData navData;

    @Override
    public void configure(ISkillConfigurator configurator) {

        x = configurator.requestOptionalDouble(KEY_X, x);
        y = configurator.requestOptionalDouble(KEY_Y, y);
        yaw = configurator.requestOptionalDouble(KEY_YAW, yaw);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        navigationMemorySlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        if (Double.isNaN(x) || Double.isNaN(y) || Double.isNaN(yaw)) {
            logger.debug("At least on of x,y and yaw is missing. using slot");
            positionSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);
        }
    }

    @Override
    public boolean init() {

        if (positionSlot != null) {
            try {
                posData = positionSlot.recall();
                return true;
            } catch (CommunicationException ex) {
                logger.error("Could not read from position slot.", ex);
                return false;
            }
        } else {
            posData = new PositionData(x, y, yaw, LengthUnit.METER, AngleUnit.RADIAN);
            return true;
        }
    }

    @Override
    public ExitToken execute() {
        if (posData == null) {
            logger.error("PositionData is empty");
            return tokenError;
        }

        logger.debug("position to navgoal: " + (posData.toString()));
        navData = new NavigationGoalData(posData);
        navData.setFrameId(PositionData.ReferenceFrame.GLOBAL);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (getCurrentStatus().isSuccess()) {
            try {
                if (navData != null) {
                    navigationMemorySlot.memorize(navData);
                }
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
