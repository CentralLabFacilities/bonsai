package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.Map;

/**
 * Use this state to wait until a moving person is recognized in front of the robot. Timouts are used to switch to far
 * persons or to also detect standing persons.
 *
 * @author prenner
 */
public class WaitAndStoreMovingPerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    //defaults 
    private final double MAX_PERSON_DIST = 2.0;
    private final double MAX_PERSON_ANGLE = 0.4;

    private final String KEY_SHORT_TIMEOUT = "#_SHORT_DISTANCE_TIMEOUT"; //Timeout in seconds!
    private final String KEY_WALKING_TIMEOUT = "#_WALKING_TIMEOUT"; //Timeout in seconds!

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> posSensor;
    private MemorySlot<PersonData> followPersonSlot;

    private long startTime;
    private long nearTimeout;
    private long walkingTimeout;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);
        followPersonSlot = configurator.getSlot("PersonDataSlot", PersonData.class);

        nearTimeout = configurator.requestInt(KEY_SHORT_TIMEOUT);
        walkingTimeout = configurator.requestInt(KEY_WALKING_TIMEOUT);

    }

    @Override
    public boolean init() {
        this.startTime = Time.currentTimeMillis();

        logger.debug("Waiting for person in front ...");
        return true;
    }

    @Override
    public ExitToken execute() {
        boolean isNearTimeout = Time.currentTimeMillis() - this.startTime > this.nearTimeout;
        boolean isWalkingTimeout = Time.currentTimeMillis() - this.startTime > this.walkingTimeout;

        List<PersonData> persons = null;
        try {
            persons = personSensor.readLast(3000);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read persons", ex);
        }
        if (persons == null) {
            return ExitToken.loop();
        }

        PersonData operator = null;
        double minDistance = Double.POSITIVE_INFINITY;
        for (PersonData person : persons) {
            if (isWalkingTimeout) {
                PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(person.getPosition(), getRobotPosition()));
                double distance = polar.getDistance(LengthUnit.METER);
                if (distance < minDistance) {
                    operator = person;
                    minDistance = distance;
                }
            }
        }

        if (operator != null) {
            PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(operator.getPosition(), getRobotPosition()));
            if (isNearTimeout
                    || (polar.getDistance(LengthUnit.METER) < MAX_PERSON_DIST
                    && polar.getAngle(AngleUnit.RADIAN) < MAX_PERSON_ANGLE)) {
                try {
                    logger.debug("put " + operator + " into followPersonSlot");
                    followPersonSlot.memorize(operator);
                    return tokenSuccess;

                } catch (CommunicationException ex) {
                    logger.fatal("Could not insert operator to follow in memory!", ex);
                    return tokenError;
                }
            }
        }

        return ExitToken.loop();
    }

    private PositionData getRobotPosition() {
        PositionData robotPosition = null;
        try {
            robotPosition = -1);
        } catch (IOException | InterruptedException ex) {
            logger.fatal(
                    "Exception while retrieving robot position!",
                    ex);
        }
        return robotPosition;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
