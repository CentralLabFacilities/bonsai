package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.knowledgebase.Room;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * This Skill is used for retrieving the room the robot is currently in.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  RoomNameSlot: [String] [Write]
 *      -> Memory slot the name of the room will be writen to
 *  NavigationGoalDataSlot: [NavigationGoalData] [Read]
 *      -> Memory slot the NavGoal will be retrieved from
 *
 * ExitTokens:
 *  success.insideArena:    Navgoal is inside the Arena, check RoomNameSlot for specifics.
 *  success.outsideArena:    Navgoal is outside the Arena, check RoomNameSlot for specifics.
 *  error:      Name of the Room could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to check the Room
 *
 *
 * </pre>
 *
 * @author saschroeder
 * @author rfeldhans
 */
public class CheckRoomOfNavgoal extends AbstractSkill {

    private ExitToken tokenSuccessInsideArena;
    private ExitToken tokenSuccessOutsideArena;
    private ExitToken tokenError;

    private MemorySlotWriter<String> roomSlot;
    private MemorySlotReader<NavigationGoalData> navigationGoalDataSlot;

    private KBaseActuator kBaseActuator;

    private String roomName;
    private NavigationGoalData navGoal;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessInsideArena = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("insideArena"));
        tokenSuccessOutsideArena = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("outsideArena"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        roomSlot = configurator.getWriteSlot(
                "RoomSlot", String.class);
        navigationGoalDataSlot = configurator.getReadSlot(
                "NavigationGoalDataSlot", NavigationGoalData.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);

    }

    @Override
    public boolean init() {
        try {
            navGoal = navigationGoalDataSlot.recall();

            if (navGoal == null) {
                logger.error("your navigationGoalDataSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("exception", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        Point2D pos = new Point2D(navGoal.getX(LengthUnit.METER), navGoal.getY(LengthUnit.METER), LengthUnit.METER);
        logger.debug("Navgoal Position: " + pos);

        Room room;
        try {
            room = kBaseActuator.getRoomForPoint(pos);
        } catch (KBaseActuator.BDONotFoundException | KBaseActuator.NoAreaFoundException e) {
            logger.error(e.getMessage());
            return tokenError;
        }
        roomName = room.getName();

        logger.info("Position \"" + pos.toString() + "\" is in room: " + roomName);

        if (roomName.equals("outside") || roomName.equals("outside the arena")) {
            return tokenSuccessOutsideArena;
        }
        return tokenSuccessInsideArena;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            roomSlot.memorize(roomName);
        } catch (CommunicationException ex) {
            logger.error("Could not memorize roomName");
            return tokenError;
        }
        return curToken;
    }
}
