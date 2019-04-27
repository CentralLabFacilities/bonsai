package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.knowledgebase.Door;
import de.unibi.citec.clf.btl.data.knowledgebase.KBase;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.LinkedList;

/**
 * This skill checks if the robot is inside a door area. Otherwise it checks for the nearest door of the current room.
 * In both cases the nearest door is written to an annotation slot.
 *
 * @author saschroeder
 */
@Deprecated
public class CheckIfDoorInRange extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessDoorNotInRange;
    private ExitToken tokenSuccessDoorInRange;
    private ExitToken tokenSuccessDoorVeryClose;
    private ExitToken tokenError;
    private ExitToken tokenErrorNoDoor;

    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;
    private MemorySlot<KBase> kbaseSlot;

    private Sensor<PositionData> posSensor;

    private KBase kbase;
    private String roomName;
    private LinkedList<Door> doorList;

    private double curDistance;
    private double shortestDistance = -1;
    private PositionData vpPosition;

    private Viewpoint vp;
    private Annotation nearestAnnotation;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccessDoorNotInRange = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("doorNotInRange"));
        tokenSuccessDoorInRange = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("doorInRange"));
        tokenSuccessDoorVeryClose = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("doorVeryClose"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenErrorNoDoor = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("noDoor"));

        kbaseSlot = configurator.getSlot("KBaseSlot", KBase.class);
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        posSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        try {
            kbase = kbaseSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not recall KBaseSlot: " + ex.getMessage());
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        PositionData robotPos = getRobotPosition();
        logger.debug("Current Robot Position: " + robotPos);
        if (robotPos == null) {
            return tokenError;
        }

        Arena arena = kbase.getArena();
        roomName = arena.getCurrentRoom(robotPos);
        logger.debug("Name of room: " + roomName);
        doorList = arena.getDoorsOfRoom(roomName);

        if (doorList.isEmpty()) {
            logger.info("This room has no doors");
            return tokenErrorNoDoor;
        }
        logger.info("This room has " + doorList.size() + " doors");

        for (Door door : this.doorList) {
            Annotation annotation = door.getAnnotation();

            /* check if robot is in range of a door */
            if (door.isIn(robotPos)) {
                logger.info("Robot is very close to a door");
                nearestAnnotation = annotation;
                if (writeNavGoal()) {
                    return tokenSuccessDoorVeryClose;
                } else {
                    return tokenError;
                }
            }

            /* check distance to door */
            vp = annotation.getMain();
            vpPosition = vp;
            logger.info("viewpoint main of door has coordinates: " + vpPosition);
            curDistance = robotPos.getDistance(vpPosition, LengthUnit.METER);
            if (shortestDistance == -1 || curDistance < shortestDistance) {
                shortestDistance = curDistance;
                nearestAnnotation = annotation;
            }
        }

        if (shortestDistance == -1) {
            logger.debug("unexpected result for shortest distance: " + shortestDistance);
            return tokenError;
        }
        logger.info("nearest door has distance: " + shortestDistance);
        if (shortestDistance > 2) {
            return tokenSuccessDoorNotInRange;
        }
        logger.info("nearest door is in range");
        if (writeNavGoal()) {
            logger.info("nearest door was written to the slot");
            return tokenSuccessDoorInRange;
        } else {
            logger.info("nearest door could not be written into the slot");
            return tokenError;
        }
    }

    private boolean writeNavGoal() {
        try {
            navigationGoalDataSlot.memorize(new NavigationGoalData(nearestAnnotation.getMain()));
        } catch (CommunicationException ex) {
            logger.error("Could not memorize navGoal (door)");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    private PositionData getRobotPosition() {
        PositionData robot = null;
        try {
            robot = -1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Exception while retrieving robot pos!", ex);
        }
        return robot;
    }

}
