package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator;
import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * TODO
 *
 *
 * @author jkummert
 */
public class LookToNearestPerson extends AbstractSkill {

    private ExitToken tokenErrorNoPerson;
    private ExitToken tokenSuccess;

    private final static AngleUnit rad = AngleUnit.RADIAN;
    private final static LengthUnit mm = LengthUnit.MILLIMETER;

    private GazeActuator gazeActuator;
    private DetectPeopleActuator peopleActuator;

    private Sensor<PositionData> positionSensor;

    private Future<PersonDataList> peopleFuture;
    private List<PersonData> currentPersons;
    private PositionData robotPos;
    private long timeout = 8000;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenErrorNoPerson = configurator.requestExitToken(ExitStatus.ERROR().ps("noPerson"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);
        peopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator.class);

        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {

        logger.debug("Detecting Persons");

        return getPeople();
    }

    @Override
    public ExitToken execute() {

        if (!peopleFuture.isDone()) {
            if (timeout < System.currentTimeMillis()) {
                return tokenErrorNoPerson;
            }
            return ExitToken.loop(50);
        }

        if (currentPersons == null) {
            try {
                currentPersons = peopleFuture.get();
            } catch (InterruptedException | ExecutionException e) {
                logger.error("cant access people actuator");
                return tokenErrorNoPerson;
            }
        }

        try {
            robotPos = positionSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from position sensor.", ex);
            return ExitToken.loop(25);
        }

        if (currentPersons == null) {
            logger.debug("Person list null");
            return tokenErrorNoPerson;
        }

        double minDist = Double.MAX_VALUE;
        PersonData closest = null;
        for (PersonData currentPerson : currentPersons) {
            PositionData globalPersonPos = CoordinateSystemConverter.localToGlobal(currentPerson.getPosition(), robotPos);

            if (robotPos.getDistance(globalPersonPos, mm) < minDist) {
                closest = currentPerson;
            }
        }

        double vertical = 0.0;
        if (!Double.isNaN(closest.getHeadPosition().getX(mm))) {
            logger.info("head pose (x,z): "+closest.getHeadPosition().getX(mm)+", "+closest.getHeadPosition().getZ(mm));
            vertical = Math.atan2(1100 - closest.getHeadPosition().getZ(mm), closest.getHeadPosition().getX(mm));
            gazeActuator.setGazeTargetPitchAsync((float) vertical, 1);
        }

        gazeActuator.setGazeTargetPitchAsync((float) vertical, 1);
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    public boolean getPeople() {
        try {
            currentPersons = null;
            peopleFuture = peopleActuator.getPeople();
            timeout += System.currentTimeMillis();
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
            return false;
        }
        return true;
    }
}
