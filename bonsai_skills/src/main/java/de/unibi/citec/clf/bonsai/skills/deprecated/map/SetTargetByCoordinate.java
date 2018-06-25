package de.unibi.citec.clf.bonsai.skills.deprecated.map;

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

/**
 * Use this state to write the {@link PositionData} of a given Coordinate to memory.
 *
 * <pre>
 * options:
 * #_X   -> x-coordinate
 * #_Y   -> y-coordinate
 * #_YAW -> yaw-angle
 *
 * </pre>
 *
 * @author ffriese
 */
@Deprecated
public class SetTargetByCoordinate extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_X = "#_X";
    private static final String KEY_Y = "#_Y";
    private static final String KEY_YAW = "#_YAW";

    private static final String SLOT_NAVGOAL = "NavigationGoalDataSlot";

    private double x, y, yaw;
    private MemorySlot<NavigationGoalData> navSlot;

    private PositionData positionData = null;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        navSlot = configurator.getSlot(SLOT_NAVGOAL, NavigationGoalData.class);

        x = configurator.requestDouble(KEY_X);
        y = configurator.requestDouble(KEY_Y);
        yaw = configurator.requestDouble(KEY_YAW);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {

        positionData = new PositionData();
        positionData.setX(x, LengthUnit.METER);
        positionData.setY(y, LengthUnit.METER);
        positionData.setYaw(yaw, AngleUnit.RADIAN);
        //positionData.setFrame(PositionData.ReferenceFrame.GLOBAL);
        positionData.setFrameId("map");//TODO: may be important to be allowed to set to "map"
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (getCurrentStatus().isSuccess()) {
            try {
                if (positionData != null) {
                    navSlot.memorize(new NavigationGoalData(positionData));
                } else {
                    return ExitToken.fatal();
                }
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
