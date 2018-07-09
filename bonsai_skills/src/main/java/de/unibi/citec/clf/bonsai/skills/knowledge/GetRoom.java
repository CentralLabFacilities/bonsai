package de.unibi.citec.clf.bonsai.skills.knowledge;


import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;

/**
 * This Skill is used for retrieving the room the robot is currently in.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  RoomNameSlot: [String] [Write]
 *      -> Memory slot the name of the room will be writen to
 *  PositionDataSlot: [PositionData] [Read]
 *      -> Memory slot position the should be retrieved of will be recalled from
 *
 * ExitTokens:
 *  success:    Name of the Room successfully retrieved
 *  error:      Name of the Room could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to retrieve the Room
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class GetRoom extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<String> roomSlot;
    private MemorySlotReader<PositionData> positionDataSlot;

    private KBaseActuator kBaseActuator;

    private String roomName;
    private PositionData positionData;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        roomSlot = configurator.getWriteSlot("RoomNameSlot", String.class);
        positionDataSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            positionData = positionDataSlot.recall();

            if (positionData == null) {
                logger.error("your PositionDataSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        return true;

    }

    @Override
    public ExitToken execute() {
        try {
            roomName = kBaseActuator.getRoomForPoint(positionData).getName();
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.fatal("Should never ever occur. " + e.getMessage());
            return ExitToken.fatal();
        } catch (KBaseActuator.NoAreaFoundException e) {
            logger.error("Position was in no room. We will just assume it was outside the arena.");
            roomName = "outside";
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                roomSlot.memorize(roomName);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize roomName");
                return tokenError;
            }
        }
        return curToken;
    }

}
