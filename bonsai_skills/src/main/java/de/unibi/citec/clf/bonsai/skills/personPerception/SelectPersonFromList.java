package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GetPersonAttributesActuator;
import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalDataList;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * Take a person from the given list and save to a separate person data slot, for further interaction.
 *
 * <pre>
 *
 * Options:
 *  #_INDEX:         [int] Optional (default: -1)
 *                          -> Index in PersonDataList to get the person from. If no index is given, the closest person
 *                             is selected.
 *  #_POP:        [boolean] Optional (default: false)
 *                          -> Whether the person is deleted from the list after it is set active
 *  #_STOP_DISTANCE:        [double] Optional (default: 800)
 *                          -> Distance considered close enough to the nav goal in mm. Consider personal space
 *  #_CHECK_IN_ARENA     [boolean] Optional (default: false)
 *                          -> Whether the person has to be inside the arena, in order to be selected
 *  #_SET_TURN     [boolean] Optional (default: false)
 *                          -> Whether a turn only navgoal towards the person will be saved in the corresponding slot
 *  #_SET_NAVGOAL     [boolean] Optional (default: false)
 *                          -> Whether a navgoal to the specified person will be saved in the corresponding slot
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Read]
 *      -> List containing persons that can be set active
 *  PersonDataSlot:             [PersonData] [Write]
 *      -> Person extracted from list
 *  NavigationGoalDataSlot          [NavigationGoalData] [Write]
 *      -> Navigation goal to the selected person
 *  Turn                        [NavigationGoalData] [Write]
 *      -> Navigation goal to only turn towards the selected person
 *
 * Sensors:
 *  PositionSensor:     [PositionData]
 *      -> Read in current robot position
 *
 * ExitTokens:
 *  success.setActive           Person and navigation goal saved to memory
 *  error
 *  error.noPersonInList:       The list in the slot was empty
 *  error.IndexOutOfBounds:     The specified index exceeds the PersonDataLists bounds.
 *
 * </pre>
 *
 * @author dleins
 */
public class SelectPersonFromList extends AbstractSkill {

    private final static String KEY_INDEX = "#_INDEX";
    private final static String KEY_POP = "#_POP";
    private final static String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private final static String KEY_CHECK_IN_ARENA = "#_CHECK_IN_ARENA";
    private final static String KEY_TURN_GOAL = "#_SET_TURN";
    private final static String KEY_NAVGOAL = "#_SET_NAVGOAL";

    private int index = -1;
    private boolean popFromList = false;
    private double stopDistance = 800;
    private boolean checkInArena = false;
    private boolean setTurn = false;
    private boolean setNavGoal = false;

    private ExitToken tokenSuccessSetActive;
    private ExitToken tokenErrorNoPersonInList;
    private ExitToken tokenErrorIndexOutOfBounds;
    private ExitToken tokenErrorNotInArena;
    private ExitToken tokenError;

    private MemorySlotWriter<PersonData> personDataSlot;
    private MemorySlotWriter<NavigationGoalData> navGoalDataSlot;
    private MemorySlotWriter<NavigationGoalData> turnGoalSlot;
    private MemorySlotReader<PersonDataList> personDataListSlot;
    private MemorySlotWriter<PersonDataList> personDataListUpdatedSlot;

    private KBaseActuator kBaseActuator;

    private Sensor<PositionData> positionSensor;

    PersonDataList personDataList;
    PersonData activePerson;
    NavigationGoalData navData, turnGoal;

    @Override
    public void configure(ISkillConfigurator configurator) {

        index = configurator.requestOptionalInt(KEY_INDEX, index);
        popFromList = configurator.requestOptionalBool(KEY_POP, popFromList);
        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);
        checkInArena = configurator.requestOptionalBool(KEY_CHECK_IN_ARENA, checkInArena);
        setTurn = configurator.requestOptionalBool(KEY_TURN_GOAL, setTurn);
        setNavGoal = configurator.requestOptionalBool(KEY_NAVGOAL, setNavGoal);

        tokenSuccessSetActive = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("setActive"));
        tokenErrorNoPersonInList = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("NoPersonInList"));
        tokenErrorIndexOutOfBounds = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("IndexOutOfBounds"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());


        tokenErrorNotInArena = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("NotInArena"));

        navGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        personDataListSlot = configurator.getReadSlot("PersonDataListSlot", PersonDataList.class);
        personDataListUpdatedSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);
        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData.class);

        turnGoalSlot = configurator.getWriteSlot("turn", NavigationGoalData.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);

        }


    @Override
    public boolean init() {
        logger.debug("Setting person active at index " + index);
        if (popFromList) {
            logger.debug("Person will be deleted after extraction!");
        }

        try {
            personDataList = personDataListSlot.recall();
        } catch (CommunicationException e) {
            logger.error("Could not read personDataList from slot");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if (personDataList == null) {
            return tokenErrorNoPersonInList;
        }

        int availablePersons = personDataList.elements.size();

        if (availablePersons == 0) {
            return tokenErrorNoPersonInList;
        }

        PositionData robotPosition;
        try {
            robotPosition = positionSensor.readLast(1);
        } catch (InterruptedException | IOException e) {
            logger.error("Failed reading robot position");
            return  tokenError;
        }

        double bestDist = Double.MAX_VALUE;
        if (index == -1) {
            for(PersonData p : personDataList) {
                activePerson = p;
                logger.debug("Processing person with UUID: "+p.getUuid());
                double distance = robotPosition.getDistance(activePerson.getPosition(), LengthUnit.MILLIMETER);

                if (checkInArena) {
                    Arena arena = kBaseActuator.getArena();
                    logger.debug("Checking if person is inside arena; Got room: "+arena.getCurrentRoom(activePerson.getPosition()));
                    if (arena.getCurrentRoom(activePerson.getPosition()).equals("outside")) {
                        logger.debug("Person not in arena");
                        activePerson = null;
                        continue;
                    }
                }

                if (distance > bestDist) {
                    logger.debug("Already found closer person");
                    continue;
                }
            }

            if (activePerson == null) {
                return tokenErrorNotInArena;
            }

        } else {

            if (index < 0 || index >= availablePersons) {
                return tokenErrorIndexOutOfBounds;
            }
            activePerson = personDataList.elements.get(index);

            if (checkInArena) {
                Arena arena = kBaseActuator.getArena();
                if (arena.getCurrentRoom(activePerson.getPosition()).equals("outside")) {
                    logger.debug("Person not in arena");
                    return tokenErrorNotInArena;
                }
            }
        }

        if (setNavGoal || setTurn) {
            double distance = robotPosition.getDistance(activePerson.getPosition(), LengthUnit.MILLIMETER);

            logger.debug("Distance to person: "+distance);
            distance = distance - stopDistance;
            logger.debug("Distance to person with stop-distance: "+distance);
            PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(activePerson.getPosition(), robotPosition));
            navData = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AngleUnit.RADIAN), distance, AngleUnit.RADIAN, LengthUnit.MILLIMETER);

            logger.debug("Creating new turn navgoal");
            turnGoal = new NavigationGoalData();
            logger.debug("Created new turn navgoal");
            double angle = robotPosition.getRelativeAngle(activePerson.getPosition(), AngleUnit.RADIAN);
            logger.debug("computed angle");
            turnGoal.setYaw(angle, AngleUnit.RADIAN);
        }

        if (popFromList) {
            logger.debug("Deleting active person from list. List has currently size "+personDataList.size());
            personDataList.elements.remove(activePerson);
            logger.debug("Person List has now "+personDataList.size()+" elements!");
        }

        return tokenSuccessSetActive;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataListUpdatedSlot.memorize(personDataList);
                personDataSlot.memorize(activePerson);
                if (setNavGoal) {
                    navGoalDataSlot.memorize(navData);
                }
                if (setTurn) {
                    turnGoalSlot.memorize(turnGoal);
                }
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
