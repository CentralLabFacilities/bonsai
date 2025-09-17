package de.unibi.citec.clf.bonsai.skills.nav;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;

import java.io.IOException;

/**
 * Stores the current robot position in the memory.
 * 
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PositionDataSlot: [PositionData] [Write]
 *      -> Memory slot to store position
 *
 * ExitTokens:
 *  success:    Position saved successfully
 *
 * Sensors:
 *  PositionSensor: [PositionData]
 *      -> Used to read the current robot position
 *
 * Actuators:
 *
 * </pre>
 *
 * @author kharmening, now maintained by cklarhor
 */
public class StoreCurrentPosition extends AbstractSkill {

    private ExitToken tokenSuccess;

    private MemorySlotWriter<Pose2D> positionSlot;
    private Sensor<Pose2D> positionSensor;

    private Pose2D posData;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        positionSlot = configurator.getWriteSlot("PositionDataSlot", Pose2D.class);
        positionSensor = configurator.getSensor("PositionSensor", Pose2D.class);
    }

    @Override
    public boolean init() {
        try {
            posData = positionSensor.readLast(1000);
            if (posData == null) {
                logger.error("position data from position sensor was null");
                return false;
            }
            logger.info("Read current position from memory: " + posData.toString());
        } catch (IOException | InterruptedException e) {
            logger.error("Could not read from position sensor");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (posData != null) {
                try {
                    positionSlot.memorize(posData);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }
}
