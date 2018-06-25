package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.MapReader;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author cklarhorst
 */
public class SetFirstinViewpointListAsNavigationGoal extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessEmpty;
    private ExitToken tokenError;
    private MemorySlot<ViewpointList> memorySlot;
    private MemorySlot<NavigationGoalData> navigationMemorySlot;
    private PositionData posData;
    private NavigationGoalData navData = null;
    private ViewpointList data;
    private Sensor<PositionData> positionSensor;

    private static final String KEY_DIRECTION = "#_DIRECTION";
    private String direction = "front";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().ps("empty"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        memorySlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        navigationMemorySlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        direction = configurator.requestOptionalValue(KEY_DIRECTION, direction);

        if (!(direction.equals("front") || direction.equals("left") || direction.equals("right") || direction.equals("back"))) {
            String ex = "direction is: " + direction + "should be front||left||right||back";
            logger.fatal(ex);
            throw new SkillConfigurationException(ex);
        }

    }

    @Override
    public boolean init() {
        try {
            data = memorySlot.recall();
            if (data == null) {
                logger.fatal("no Positions saved");
                return false;
            }

            return true;
        } catch (CommunicationException ex) {
            logger.fatal("Memory read failed");
            return false;
        }
    }

    @Override
    public ExitToken execute() {

        if (data == null) {
            return tokenSuccessEmpty;
        }
        try {
            posData = data.get(data.size() - 1);
        } catch (IndexOutOfBoundsException e) {
            logger.error("PositionDataList is empty");
        }
        if (posData == null) {
            return tokenSuccessEmpty;
        }
        try {
            if (posData.getDistance(positionSensor.readLast(1000), LengthUnit.METER) < 1) {
                data.remove(data.size() - 1);
                posData = data.get(data.size() - 1);
            }
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SetFirstinViewpointListAsNavigationGoal.class.getName()).log(Level.SEVERE, null, ex);
        } catch (IndexOutOfBoundsException e) {
            logger.error("PositionDataList is empty");
        }
        if (posData == null) {
            return tokenSuccessEmpty;
        }

        logger.info("Read yaw rad" + posData.getYaw(AngleUnit.RADIAN));
        double currentYaw = posData.getYaw(AngleUnit.DEGREE);
        switch (direction) {
            case "back":
                posData.setYaw(currentYaw - 180, AngleUnit.DEGREE);
                break;
            case "left":
                posData.setYaw(currentYaw + 90, AngleUnit.DEGREE);
                break;
            case "right":
                posData.setYaw(currentYaw - 90, AngleUnit.DEGREE);
                break;
        }
        logger.info("direction: " + direction + "  set yaw rad: " + posData.getYaw(AngleUnit.RADIAN));
        logger.info("pdata: " + (posData.toString()));
        navData = new NavigationGoalData(posData);
        navData.setCoordinateTolerance(1, LengthUnit.METER);
        navData.setYawTolerance(180, AngleUnit.DEGREE);
        navData.setYaw(currentYaw + 180, AngleUnit.DEGREE);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (getCurrentStatus().isSuccess()) {
            try {
                if (navData != null && data.size() > 0) {
                    navigationMemorySlot.memorize(navData);
                    data.remove(data.size() - 1);
                    memorySlot.memorize(data);
                    return tokenSuccess;
                } else if (navData != null) {
                    return tokenSuccessEmpty;
                }

            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }

        if (getCurrentStatus().isFatal()) {
            return tokenError;
        }

        return tokenSuccessEmpty;
    }

}
