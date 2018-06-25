package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.knowledgebase.KBase;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 *
 * @author sarah
 */
@Deprecated
public class CheckRoomOfNavgoal extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessInsideArena;
    private ExitToken tokenSuccessOutsideArena;
    private ExitToken tokenError;

    private MemorySlot<String> roomSlot;
    private MemorySlot<KBase> kbaseSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;

    private Sensor<PositionData> posSensor;

    private KBase kbase;
    private String roomName;
    private NavigationGoalData navGoal;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessInsideArena = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("insideArena"));
        tokenSuccessOutsideArena = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("outsideArena"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        roomSlot = configurator.getSlot(
                "RoomSlot", String.class);
        kbaseSlot = configurator.getSlot(
                "KBaseSlot", KBase.class);
        navigationGoalDataSlot = configurator.getSlot(
                "NavigationGoalDataSlot", NavigationGoalData.class);

        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

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
        try {
            kbase = kbaseSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not recall KBaseSlot: " + ex.getMessage());
        }

        return true;

    }

    @Override
    public ExitToken execute() {

        PositionData pos = new PositionData(navGoal.getX(LengthUnit.METER), navGoal.getY(LengthUnit.METER), navGoal.getYaw(AngleUnit.RADIAN), new Timestamp(), LengthUnit.METER, AngleUnit.RADIAN);

        logger.debug("Person Position: " + pos);

        Arena arena = kbase.getArena();

        roomName = arena.getCurrentRoom(pos);

        logger.debug("Name of room: " + roomName);

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
