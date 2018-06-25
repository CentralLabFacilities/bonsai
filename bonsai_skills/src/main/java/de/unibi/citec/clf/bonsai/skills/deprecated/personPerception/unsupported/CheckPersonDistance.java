package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Check if the actual distance to a given Person is bigger than a distance.
 *
 *
 *
 * @author pdressel, now maintained by cklarhor
 */
public class CheckPersonDistance extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessNoPersonResponse;
    private ExitToken tokenSuccessPositiveResponse;
    private ExitToken tokenSuccessNegativeResponse;
    private ExitToken tokenError;

    private static final double DEFAULT_MIN_PERSON_DISTANCE = 2.0;
    private static final String PERSON_DISTANCE_KEY = "#_PERSON_DISTANCE";
    private static final String WAIT_FOR_NEGATIVE_KEY = "#_WAIT_NEGATIVE_ONLY";

    private static final String POSITIVE_RESPONSE = "WithinDistance";
    private static final String NEGATIVE_RESPONSE = "OutOfDistance";
    private static final String NO_PERSON_RESPONSE = "NoPerson";
    PersonData personData;
    private Sensor<PositionData> positionSensor;
    private MemorySlot<PersonData> personSlot;
    private double minGoalDistance;
    private boolean waitForNegativeOnly;

    @Override
    public void configure(ISkillConfigurator configurator) {

        minGoalDistance = configurator.requestOptionalDouble(PERSON_DISTANCE_KEY, DEFAULT_MIN_PERSON_DISTANCE);
        waitForNegativeOnly = configurator.requestOptionalBool(WAIT_FOR_NEGATIVE_KEY, false);

        // request all tokens that you plan to return from other methods
        tokenSuccessNoPersonResponse = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(NO_PERSON_RESPONSE));
        tokenSuccessPositiveResponse = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(POSITIVE_RESPONSE));
        tokenSuccessNegativeResponse = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(NEGATIVE_RESPONSE));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
        personSlot = configurator.getSlot("PersonDataSlot", PersonData.class);
    }

    @Override
    public boolean init() {

        try {
            personData = personSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("There is nothing in my personSlot");
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        try {

            if (personData == null) {
                logger.fatal("There is nothing in my personSlot");
                return tokenSuccessNoPersonResponse;
            }
            PositionData currentRobotPosition = positionSensor.readLast(1000);
            if (currentRobotPosition == null) {
                logger.fatal("PositionSensor timed out (1000ms) -> looping");
                return ExitToken.loop();
            }
            PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                    personData.getPosition(), currentRobotPosition));

            double distance = polar.getDistance(LengthUnit.METER);
            if (distance < minGoalDistance) {
                if (waitForNegativeOnly) {
                    return ExitToken.loop();
                } else {
                    return tokenSuccessPositiveResponse;
                }
            } else {
                return tokenSuccessNegativeResponse;
            }
        } catch (IOException | InterruptedException ex) {
            logger.error(ex);
        }
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
