package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.map.ViewpointList;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 *
 * @author tschumacher
 *
 */
public class DeleteViewpointsFromList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessListEmpty;
    private ExitToken tokenError;

    private MemorySlot<ViewpointList> memorySlot;
    private Viewpoint currentViewpoint;
    private ViewpointList allViewpoints;
    private Sensor<PositionData> positionSensor;
    private PositionData robotPosition;

    private double minDistance;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessListEmpty = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("listEmpty"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        memorySlot = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        minDistance = 10000000;
    }

    @Override
    public boolean init() {
        try {
            //lese Viewpoint Liste ein.
            allViewpoints = memorySlot.recall();
            robotPosition = positionSensor.readLast(1000);
            return true;
        } catch (CommunicationException | InterruptedException ex) {
            logger.fatal("Memory read failed");
        } catch (IOException ex) {
            logger.fatal("read Robot Position failed");
        }
        return false;

    }

    @Override
    public ExitToken execute() {

        if (allViewpoints.size() > 0) {
            currentViewpoint = allViewpoints.get(allViewpoints.size() - 1);
            double currDistance = robotPosition.getDistance(currentViewpoint, LengthUnit.METER);
            if (currDistance < minDistance) {
                minDistance = currDistance;
                allViewpoints.remove(currentViewpoint);
                return ExitToken.loop();
            } else {
                return tokenSuccess;
            }
        }
        return tokenSuccessListEmpty;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            memorySlot.memorize(allViewpoints);
        } catch (CommunicationException ex) {
            logger.error("Could not memorize");
            return tokenError;
        }
        return curToken;
    }

}
