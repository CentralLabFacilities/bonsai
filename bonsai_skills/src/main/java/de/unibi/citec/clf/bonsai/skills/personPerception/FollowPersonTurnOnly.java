package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.DriveData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.TurnData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;

import java.io.IOException;

/**
 * In this state the robot follows given person by only turning.
 *
 * <pre>
 *
 * Options:
 *  #_TURN_SPEED:       [double] Optional (default: 0.3)
 *                          -> Speed for turning in m/s
 *
 * Slots:
 *  FollowPersonSlot:   [PersonData] [Read and Write]
 *      -> Read in person to follow and save person at the end
 *
 * ExitTokens:
 *  error:      person to follow was lost
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *  PositionSensor:     [PositionData]
 *      -> Read current robot position
 *
 * Actuators:
 *  NavigationActuator: [NavigationActuator]
 *      -> Called to execute turning
 *
 * </pre>
 *
 * @author prenner
 * @author (Commented and partly reworked) jpoeppel
 * @author lziegler
 * @author rfeldhans
 * @author jkummert
 */
public class FollowPersonTurnOnly extends AbstractSkill {

    private static final String KEY_TURN_SPEED = "#_TURN_SPEED";

    private double turnSpeed = 0.3;

    private ExitToken tokenError;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> posSensor;

    private NavigationActuator navActuator;

    private MemorySlotReader<PersonData> followPersonSlotReader;
    private MemorySlotWriter<PersonData> followPersonSlotWriter;

    private PersonData personFollow = null;

    @Override
    public void configure(ISkillConfigurator configurator) {
        turnSpeed = configurator.requestOptionalDouble(KEY_TURN_SPEED, turnSpeed);

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);

        followPersonSlotReader = configurator.getReadSlot("FollowPersonSlot", PersonData.class);
        followPersonSlotWriter = configurator.getWriteSlot("FollowPersonSlot", PersonData.class);
    }

    @Override
    public boolean init() {
        try {
            personFollow = followPersonSlotReader.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read person to follow from memory", ex);
            return false;
        }
        if (personFollow == null) {
            logger.error("Person to follow is null");
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        PositionData robotPosition = getRobotPosition();
        if (robotPosition == null) {
            logger.error("Got no robot position");
            return ExitToken.fatal();
        }

        personFollow = findPersonToFollow();
        if (personFollow == null) {
            logger.error("could not find the person to follow");
            return tokenError;
        }

        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(personFollow.getPosition(), robotPosition));
        double angle = polar.getAngle(AngleUnit.RADIAN);

        TurnData turnData = null;
        if (!Double.isNaN(angle) && angle != 0) {
            turnData = new TurnData(angle, AngleUnit.RADIAN, turnSpeed, RotationalSpeedUnit.RADIANS_PER_SEC);
        }
        logger.debug("Driving to " + turnData);
        try {
            navActuator.moveRelative(new DriveData(0, LengthUnit.METER, 0, SpeedUnit.METER_PER_SEC), turnData);
        } catch (IOException e) {
            e.printStackTrace();
        }

        try {
            followPersonSlotWriter.memorize(personFollow);
        } catch (CommunicationException e) {
            logger.error("Could not momorize followed person", e);
        }

        return ExitToken.loop(50);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    private PositionData getRobotPosition() {
        PositionData robotPosition = null;
        try {
            robotPosition = posSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read robot position", ex);
        }
        return robotPosition;
    }

    private PersonData findPersonToFollow() {
        List<PersonData> persons = getPersons();
        if (persons == null) {
            logger.error("persons = null");
            return null;
        }
        PersonData p = null;
        for (PersonData person : persons) {
            if (person.getUuid().equals(personFollow.getUuid())) {
                p = person;
                return p;
            }
        }

        return null;
    }

    private List<PersonData> getPersons() {
        List<PersonData> persons = null;
        try {
            persons = personSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person sensor", ex);
        }
        return persons;
    }
}
