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
 * Stores the current robot position in the PositionMemorySlot
 *
 * Exits with success, error, fatal
 *
 * @author kharmening, now maintained by cklarhor
 */
public class StoreCurrentPositioninList extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private MemorySlot<ViewpointList> positionSlotList;
    private Sensor<PositionData> positionSensor;

    private PositionData posData;
    private PositionData oldPosition;

    private ViewpointList data;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        positionSlotList = configurator.getSlot("ViewpointListSlot", ViewpointList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            posData = positionSensor.readLast(5000);
            if (posData == null) {
                logger.fatal("Sry positionSensor timed out --> looping");
            } else {
                if (oldPosition == null || oldPosition.getDistance(posData, LengthUnit.METER) > 1.0) {
                    oldPosition = posData;
                    logger.info("Read current position from memory: " + posData.toString());
                    data = positionSlotList.recall();

                    if (data == null) {
                        data = new ViewpointList();
                    }

                    Viewpoint point = (Viewpoint)posData;
                    data.add(point);

                    positionSlotList.memorize(data);
                    logger.debug("Stored position " + posData + "in list");

                }
            }
        } catch (IOException | InterruptedException e) {
            logger.error(e.getMessage());
        } catch (CommunicationException ex) {
            logger.fatal("Unable to write to memory: " + ex.getMessage());
            return ExitToken.fatal();
        }
        return ExitToken.loop();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
