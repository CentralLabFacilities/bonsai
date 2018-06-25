package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GetPersonAttributesActuator;
import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.concurrent.ExecutionException;

/**
 * Skill that waits for a waving hand and stores the position as
 * {@link NavigationGoalData} to memory.
 *
 * <pre>
 * options:
 * (optional) #_TIMEOUT(in ms) -> enable timeout after x ms (optional)
 * (optional) #_RADIUS(in m) -> default 1
 *
 * slots:
 * {@link NavigationGoalData} navigationGoalDataSlot -> saves navGoal in front of person.
 *
 * possible return states are:
 * success -> person found
 * success.timeout -> timeout
 * error -> could not find a {@link NavigationGoalData}
 * fatal -> a hard error occurred e.g. Slot communication error
 *
 * this skill loops till waving is detected. Then tries to find a reachable {@link NavigationGoalData} in front of it.
 * Default is no timeout.
 * </pre>
 *
 * @author lkettenb, lruegeme
 */

//USE SEARCHFORPERSON INSTEAD

@Deprecated
public class StoreWavingHandPosition extends AbstractSkill {

    private static final String TIMEOUT_KEY = "#_TIMEOUT";
    private static final String DISTANCE_KEY = "#_KEEPDISTANCE";
    
    
    //defaults
    private long timeout = -1;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessTimeout;
    private ExitToken tokenError;

    private Sensor<PositionData> positionSensor;
    private Sensor<PersonDataList> personSensor;

    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;
    private NavigationActuator navActuator;
    private GetPersonAttributesActuator attributeActuator;

    private PositionData localWavingPos;
    private PositionData globalWavingPos;
    private PositionData robotPos;

    NavigationGoalData navGoal = null;
    private final static LengthUnit m = LengthUnit.METER;
    private double distanceToHold = 0.5;
    private String frameId = "map";

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        navActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
        attributeActuator = configurator.getActuator("GetPersonAttributesActuator", GetPersonAttributesActuator.class);

        timeout = configurator.requestOptionalInt(TIMEOUT_KEY, (int) timeout);
        distanceToHold = configurator.requestOptionalDouble(DISTANCE_KEY, distanceToHold);

        if (timeout > 0) {
            tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {

        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms");
            timeout += System.currentTimeMillis();
        }
        // Wait for persons in front of sensor
        logger.debug("Waiting for waving ...");

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("StoreWavingHandPosition timeout");
                return tokenSuccessTimeout;
            }
        }

        if (localWavingPos == null) {
            return readSensor();
        }

        PositionData robotOrigin = new PositionData(0.0, 0.0, 0.0, localWavingPos.getTimestamp(), m, AngleUnit.RADIAN);

        double localAngle = CoordinateSystemConverter.positionData2Angle(
                robotOrigin, localWavingPos, AngleUnit.RADIAN);
        double dist = CoordinateSystemConverter.positionDistance(
                robotOrigin, localWavingPos, m);
        navGoal = CoordinateSystemConverter.polar2NavigationGoalData(robotPos, localAngle, dist - distanceToHold, AngleUnit.RADIAN, m);
        logger.debug("globalWavingPos frameid: " + globalWavingPos.getFrameId());
        navGoal.setFrameId(frameId);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (navGoal != null) {
            try {
                navigationGoalDataSlot.memorize(navGoal);
                logger.info("Stored navigation position of waving hand");

            } catch (CommunicationException ex) {
                logger.fatal("Could not memorize NavigationGoalData");
                return ExitToken.fatal();
            }
        }
        return tokenSuccess;
    }

    public ExitToken readSensor() {
        List<PersonData> personList = null;
        robotPos = null;

        try {
            personList = personSensor.readLast(500);
            robotPos = positionSensor.readLast(500);
            logger.debug("Robot pos: " + robotPos.toString());
        } catch (IOException ex) {
            logger.error("IOException while trying to read from sensor."
                    + ex.getMessage());
            return ExitToken.fatal();
        } catch (InterruptedException ex) {
            logger.error("InterruptedException while trying to read from sensor."
                    + ex.getMessage());
            return ExitToken.fatal();
        }
        if (personList == null || personList.isEmpty()) {
            logger.debug("no persons seen");
            return ExitToken.loop();
        }

        if (robotPos == null) {
            logger.debug("pos data is null");
            return ExitToken.loop();
        }

        for (int i = 0; i < personList.size(); ++i) {
            PersonAttribute attribute = null;
            try {
                attribute = attributeActuator.getPersonAttributes(personList.get(i).getUuid());
                logger.info("got attributes of uuid: " + personList.get(i).getUuid() + "gesture was: " + attribute.getGesture());
            } catch (InterruptedException | ExecutionException ex) {
                logger.warn("could not get person attribute: " + ex);
                return ExitToken.loop();
            }
            if (attribute == null) {
                logger.warn("person attribute is null");
                return ExitToken.loop();
            }
            if (attribute.getGesture().equals(PersonAttribute.Gesture.WAVING) ||
                    attribute.getGesture().equals(PersonAttribute.Gesture.RAISING_LEFT_ARM) ||
                    attribute.getGesture().equals(PersonAttribute.Gesture.RAISING_RIGHT_ARM)) {
                globalWavingPos = personList.get(i).getPosition();
                frameId = personList.get(i).getFrameId();
            }
        }

        if (globalWavingPos == null) {
            logger.info("Saw no one waving. looping");
            return ExitToken.loop();
        }
        
        logger.info("saw waving at " + globalWavingPos.toString());
        localWavingPos = CoordinateSystemConverter.globalToLocal(globalWavingPos, robotPos);

        return ExitToken.loop();
    }
}
