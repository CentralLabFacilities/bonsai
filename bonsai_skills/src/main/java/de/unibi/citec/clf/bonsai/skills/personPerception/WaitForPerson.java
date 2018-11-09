package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.object.TransformLookup;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Use this state to wait until a person is recognized in front of the robot.
 *
 * <pre>
 * options:
 * (optional) #_TIMEOUT(in ms)    -> enable timeout after x ms
 * (optional) #_MAX_DIST(meter)   -> max Person Distance
 * (optional) #_MAX_ANGLE(rad)    -> max Person Angle (in both directions)
 *
 * slots:
 * PersonData currentPersonSlot -> saves the found person.
 *
 * possible return states are:
 * success             -> person found
 * success.timeout     -> timeout
 * fatal               -> a hard error occurred e.g. Slot communication error
 *
 * this skill loops till the robot recognized a person in front.
 * Default is no timeout.
 * </pre>
 *
 * 
 * 
 * @author lkettenb, lruegeme
 */

public class WaitForPerson extends AbstractSkill {

    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_DIST = "#_MAX_DIST";
    private static final String KEY_ANGLE = "#_MAX_ANGLE";

    //defaults
    private long timeout = -1;
    private double maxDist = 2.0;
    private double maxAngle = 0.4;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessTimeout;

    private Sensor<PersonDataList> personSensor;
    //private Sensor<PositionData> positionSensor;
    private MemorySlot<PersonData> currentPersonSlot;

    PersonData personInFront = null;
    List<PersonData> persons;
    TransformLookup tf;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tf = configurator.getTransform();

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        //positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        currentPersonSlot = configurator.getSlot("PersonDataSlot", PersonData.class);

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        maxDist = configurator.requestOptionalDouble(KEY_DIST, maxDist);
        maxAngle = configurator.requestOptionalDouble(KEY_ANGLE, maxAngle);

        if (timeout > 0) {
            tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {

        logger.info("Data in WaitForPerson [timeout=" + timeout + ", maxDist="
                + maxDist + ", maxAngle=" + maxAngle + "]");

        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms");
            timeout += System.currentTimeMillis();
        }
        // Wait for persons in front of sensor
        logger.debug("Waiting for person in front ...");

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("WaitForPerson timeout");
                return tokenSuccessTimeout;
            }
        }

        try {
            persons = personSensor.readLast(200);
            //robotPosition = positionSensor.readLast(200);
        } catch (IOException | InterruptedException ex) {
            logger.error("Exception while retrieving stuff", ex);
            return ExitToken.fatal();
        }

        if (persons == null) {
            logger.warn("Not read from person sensor.");
            return ExitToken.loop();
        }
        if (persons.isEmpty()) {
            logger.debug("No persons found.");
            return ExitToken.loop();
        }
//        if (robotPosition == null) {
//            logger.warn("Not read from position sensor.");
//            return ExitToken.loop();
//        }

        personInFront = null;
        PolarCoordinate polar;

        String personsDebug = "";
        personsDebug = persons.stream().map((person) -> person.getUuid() + " ").reduce(personsDebug, String::concat);
        logger.info("persons: " + personsDebug);

        PersonData front;
        if(!persons.isEmpty() && !persons.get(0).isInBaseFrame()) {
            //TODO
            logger.error("todo: tranform to base link");

//            for (PersonData p : persons) {
//                try {
//                    tf.lookup(p.getFrameId(),Type.BASE_FRAME,p.getTimestamp().getUpdated().getTime());
//                } catch (TransformException e) {
//                    logger.error("cant Transform from " + p.getFrameId() + " to " + Type.BASE_FRAME + " @" + p.getTimestamp().getUpdated().getTime());
//                }
//            }

        }

        PersonHelper.sortPersonsByDistance(persons);
        for (PersonData p : persons) {

            polar = new PolarCoordinate(p.getPosition());

            logger.debug("Person " + p.getUuid() + " frame person:" + p.getFrameId()
                    + " frame polar: " + polar.getFrameId()
                    + "\n dist:" + polar.getDistance(LengthUnit.METER)
                    + "\n angle:" + polar.getAngle(AngleUnit.RADIAN));
            // if person too far away
            if (polar.getDistance(LengthUnit.METER) < maxDist
                    && (Math.abs(polar.getAngle(AngleUnit.RADIAN))) < maxAngle) {
                logger.info("person is in front!" + p.getUuid());
                personInFront = p;
                break;
            }

        }
        if (personInFront != null) {
            return tokenSuccess;
        } else {
            return ExitToken.loop();
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (personInFront != null) {
            try {
                currentPersonSlot.memorize(personInFront);
                return tokenSuccess;
            } catch (CommunicationException ex) {
                logger.fatal(
                        "Exception while storing current Person in memory!", ex);
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
