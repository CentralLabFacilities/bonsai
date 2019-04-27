package de.unibi.citec.clf.bonsai.skills.nav.drive;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.helper.DriveStrategyBuilder;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Drive to a given person.
 *
 * <pre>
 *
 * Options:
 *  #_PERSON_LOST_TIMEOUT:  [long] Optional (default: 100)
 *                              -> Time passed in ms without seeing the person before exiting
 *  #_STOP_DISTANCE:        [double] Optional (default: 800)
 *                              -> Distance considered close enough to the person in mm. Consider personal space
 *  #_STRATEGY:             [String] Optional (default: "NearestToTarget")
 *                              -> Drive strategy to drive to person
 *  #_REFIND_DISTANCE:      [double] Optional (default: 500)
 *                              -> In case the robot looses track of the person it tries to refind them this close to where they were seen last in mm
 *
 *
 * Slots:
 *  PersonDataSlot:       [PersonData] [Read and Write]
 *      -> Read in person to drive to. If successfull save the person to memory
 *
 * ExitTokens:
 *  success:                No goal was set in #_NO_GOAL_TIMEOUT ms
 *  error.personLost:       Cannot find person or person is more than #_PERSON_LOST_DISTANCE away
 *  error.couldNotReach:    Robot could not get within #_STOP_DISTANCE of person
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *  PositionSensor:     [PositionData]
 *      -> Read current robot position
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute drive
 *
 * </pre>
 *
 * @author jkummert
 */
public class NavigateToPerson extends AbstractSkill {

    private static final String KEY_PERSON_LOST_TIMEOUT = "#_PERSON_LOST_TIMEOUT";
    private static final String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private static final String KEY_STRATEGY = "#_STRATEGY";
    private static final String KEY_REFIND_DISTANCE = "#_REFIND_DISTANCE";

    private long personLostTimeout = 100L;
    private double stopDistance = 1200;
    private String strategy = "NearestToTarget";
    private double refindDistance = 500;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorCouldNotReach;
    private ExitToken tokenErrorPersonLost;

    private static final LengthUnit LU = LengthUnit.MILLIMETER;
    private static final AngleUnit AU = AngleUnit.RADIAN;

    private MemorySlotReader<PersonData> targetPersonSlotReader;
    private MemorySlotWriter<PersonData> targetPersonSlotWriter;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> posSensor;

    private NavigationActuator navActuator;

    private long lastPersonFound = 0;
    private PersonData personFollow = null;
    private PositionData initialPosition = null;
    private PositionData robotPosition = null;
    private DriveStrategy driveStrategy;
    private DriveStrategy.StrategyState state;
    private Future<CommandResult> navResult;
    private double distanceMod = 0.5;

    @Override
    public void configure(ISkillConfigurator configurator) {

        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);
        personLostTimeout = configurator.requestOptionalInt(KEY_PERSON_LOST_TIMEOUT, (int) personLostTimeout);
        strategy = configurator.requestOptionalValue(KEY_STRATEGY, strategy);
        refindDistance = configurator.requestOptionalDouble(KEY_REFIND_DISTANCE, refindDistance);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorCouldNotReach = configurator.requestExitToken(ExitStatus.ERROR().ps("couldNotReach"));
        if (personLostTimeout > 0) {
            tokenErrorPersonLost = configurator.requestExitToken(ExitStatus.ERROR().ps("personLost"));
        }

        targetPersonSlotReader = configurator.getReadSlot("PersonDataSlot", PersonData.class);
        targetPersonSlotWriter = configurator.getWriteSlot("PersonDataSlot", PersonData.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);

        driveStrategy = DriveStrategyBuilder.createStrategy(strategy, configurator, navActuator, posSensor);
    }

    @Override
    public boolean init() {

        try {
            personFollow = targetPersonSlotReader.recall();

            if (personFollow == null) {
                logger.error("No person to follow in memory");
                return false;
            }

            initialPosition = new PositionData(personFollow.getPosition());
        } catch (CommunicationException ex) {
            logger.error("Could not read person from memory", ex);
            return false;
        }

        logger.debug("Driving to person: " + personFollow.getUuid());
        return true;
    }

    @Override
    public ExitToken execute() {
        robotPosition = getRobotPosition();
        personFollow = findPersonToFollow();

        try {
            if (navResult != null && (navResult.get().getResultType().equals(CommandResult.Result.CANCELLED) || navResult.get().getResultType().equals(CommandResult.Result.UNKNOWN_ERROR))) {
                distanceMod += 0.1;
                logger.debug("setting distanceMod to " + distanceMod);
                if (distanceMod > 1.0) {
                    return tokenErrorCouldNotReach;
                }
            }
        } catch (InterruptedException | ExecutionException ex) {
            logger.error("Could not read nav result");
        }

        if (robotPosition == null) {
            logger.warn("Got no robot position");
            return ExitToken.loop(50);
        }

        if (personFollow == null) {
            logger.warn("Person lost.");
            return tokenErrorPersonLost;
        }

        logger.debug("Current distance to person: " + robotPosition.getDistance(personFollow.getPosition(), LU));
        if (robotPosition.getDistance(personFollow.getPosition(), LU) <= stopDistance) {
            return tokenSuccess;
        }

        lastPersonFound = Time.currentTimeMillis();
        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(personFollow.getPosition(), robotPosition));

        double distance = calculateDriveDistance(polar);

        NavigationGoalData goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, polar.getAngle(AU), distance, AU, LU);

        if (goal == null) {
            logger.error("goal null, looping");
            return ExitToken.loop(50);
        }

        logger.info("Goal set" + goal.toString());

        try {
            navResult = navActuator.navigateToCoordinate(goal);
        } catch (IOException e) {
            e.printStackTrace();
        }
        return ExitToken.loop(50);
    }

    private PositionData getRobotPosition() {

        PositionData robot = null;
        try {
            robot = -1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read robot position", ex);
        }
        return robot;
    }

    private PersonData findPersonToFollow() {

        List<PersonData> persons;
        try {
            persons = personSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.error("Could not read from person sensor", ex);
            return null;
        }
        if (persons == null) {
            logger.warn("no persons found");
            return null;
        }

        for (PersonData person : persons) {

            if (person.getUuid().equals(personFollow.getUuid())) {
                logger.debug("person with id " + person.getUuid() + " found");
                return person;
            }
        }

        return null;
    }

    private ExitToken handlePersonMissing() {

        if (personLostTimeout > 0 && Time.currentTimeMillis() > lastPersonFound + personLostTimeout) {
            logger.info("Person lost! Did not find person. Trying to refind person at old position");

            personFollow = findClosestToPosition(initialPosition, refindDistance);
            if (personFollow != null) {
                initialPosition = new PositionData(personFollow.getPosition());
                return ExitToken.loop(50);
            }
            return tokenErrorPersonLost;
        } else {
            return ExitToken.loop(100);
        }
    }

    public PersonData findClosestToPosition(PositionData old, double maxDist) {
        double cur = maxDist;
        PersonData best = null;
        List<PersonData> personList;
        try {
            personList = personSensor.readLast(5000);
        } catch (IOException | InterruptedException ex) {
            logger.error("Exception while retrieving persons from sensor !", ex);
            return null;
        }
        if (personList != null) {
            for (PersonData p : personList) {
                PositionData pos = p.getPosition();
                double dist = pos.getDistance(old, LU);

                if (dist < cur) {
                    cur = dist;
                    best = p;
                }
            }
        }
        return best;
    }

    private double calculateDriveDistance(PolarCoordinate polar) {
        double distance;
        distance = polar.getDistance(LU) - (distanceMod * stopDistance);

        if (distance < 0) {
            distance = 0;
        }

        return distance;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        try {
            navActuator.manualStop();
        } catch (IOException ex) {
            logger.error("Could not call manual stop");
        }
        if (curToken.getExitStatus().isSuccess()) {
            try {
                targetPersonSlotWriter.memorize(personFollow);
            } catch (CommunicationException ex) {
                logger.error("Could not write person data to memory", ex);
            }
        }
        return curToken;
    }
}
