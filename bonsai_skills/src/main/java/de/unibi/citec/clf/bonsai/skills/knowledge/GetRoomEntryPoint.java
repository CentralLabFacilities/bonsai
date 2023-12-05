package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.Door;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * This Skill is used to retrieve a good entry point for a given room and from a given position.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  RoomNameSlot: [String] [Read]
 *      -> Memory slot the name of the location will be writen to
 *  PositionDataSlot: [PositionData] [Read]
 *      -> Memory slot with the position from which a good entry point shall be generated from
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Memory slot the room entry point will be written to
 *
 * ExitTokens:
 *  success:                Name of the Location successfully retrieved
 *  error.noDoor            The given room has no doors, so an entry is too difficult to find.
 *  error                   Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to retrieve the Room and its doors
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
@Deprecated
public class GetRoomEntryPoint extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoDoor;
    private ExitToken tokenError;

    private MemorySlotReader<String> roomSlot;
    private MemorySlotReader<PositionData> positionDataSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalSlot;

    private KBaseActuator kBaseActuator;

    private String roomName;
    private PositionData positionData;
    private NavigationGoalData navigationGoalData;


    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoDoor = configurator.requestExitToken(ExitStatus.ERROR().ps("noDoor"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        roomSlot = configurator.getReadSlot("RoomNameSlot", String.class);
        positionDataSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);
        navigationGoalSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

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
        try {
            roomName = roomSlot.recall();

            if (roomName == null) {
                logger.error("your RoomNameSlot was empty");
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
        List<Door> theDoors;
        try {
            theDoors = kBaseActuator.getBDOByAttribute(Door.class, "room", roomName);
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.error("The BDO could not be found! " + e.getMessage());
            return tokenError;
        }
        if (theDoors.size() < 1) {
            logger.error("The " + roomName + " room has no doors, so a good entry spot could not be found");
            return tokenErrorNoDoor;
        }

        //TODO: create a plan to drive to those viewpoints and use the length of the path to get the nearest viewpoint instead of the bee line
        Viewpoint nearestVP = null;
        for (Door door : theDoors) {
            Viewpoint vp = door.getAnnotation().getViewpointByName(roomName.toLowerCase());
            if (vp != null) {
                if (nearestVP != null){
                    if(vp.getDistance(positionData, LengthUnit.METER) < nearestVP.getDistance(positionData, LengthUnit.METER)){
                        nearestVP = vp;
                    }
                } else{
                    nearestVP = vp;
                }
            }
        }
        navigationGoalData = new NavigationGoalData(nearestVP);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                navigationGoalSlot.memorize(navigationGoalData);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize locationName");
                return tokenError;
            }
        }
        return curToken;
    }
}
