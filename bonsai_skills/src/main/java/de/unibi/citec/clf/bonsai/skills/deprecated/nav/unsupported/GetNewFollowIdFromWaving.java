package de.unibi.citec.clf.bonsai.skills.deprecated.nav.unsupported;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author lruegeme
 */
public class GetNewFollowIdFromWaving extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_MAX_DISTANCE = "#_MAX_DIST";
    private static final String KEY_MAX_ANGLE = "#_MAX_ANGLE";
    //defaults

    private double maxAngle = 1.5;

    private static final LengthUnit LU = LengthUnit.MILLIMETER;
    private MemorySlot<NavigationGoalData> handPosSlot;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> posSensor;

    private MemorySlot<PersonData> followPersonSlot;
    private PersonData person = null;
    private NavigationGoalData handPos = null;
    private PositionData robotPos = null;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        // Initialize sensors
        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        handPosSlot = configurator.getSlot("NavigationGoalData", NavigationGoalData.class);
        followPersonSlot = configurator.getSlot("PersonDataSlot",
                PersonData.class);

        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        maxAngle = configurator.requestOptionalDouble(KEY_MAX_ANGLE, maxAngle);

    }

    @Override
    public boolean init() {
        try {
            try {
                person = followPersonSlot.recall();
            } catch (CommunicationException ex) {
                logger.fatal("followPersonSlot fataled.");
                return false;
            }

            handPos = handPosSlot.recall();

            try {
                robotPos = posSensor.readLast(-1);
            } catch (IOException ex) {
                Logger.getLogger(GetNewFollowIdFromWaving.class.getName()).log(Level.SEVERE, null, ex);
                logger.fatal("robotPos problem");
            } catch (InterruptedException ex) {
                logger.fatal("robotPos problem");
                Logger.getLogger(GetNewFollowIdFromWaving.class.getName()).log(Level.SEVERE, null, ex);
            }

            return person != null;
        } catch (CommunicationException ex) {
            Logger.getLogger(GetNewFollowIdFromWaving.class.getName()).log(Level.SEVERE, null, ex);
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        PersonData target = null;
        target = findClosestToPosition(person);

        if (target != null) {
            person = target;
            return tokenSuccess;
        } else {
            return tokenError;
        }
    }

    public PersonData findClosestToPosition(PersonData old) {
        double cur = Double.POSITIVE_INFINITY;
        PersonData best = null;
        List<PersonData> personList = getPersons();
        try {
            robotPos = posSensor.readLast(-1);
        } catch (IOException ex) {
            Logger.getLogger(GetNewFollowIdFromWaving.class.getName()).log(Level.SEVERE, null, ex);
            logger.fatal("Problem with posSensor");
        } catch (InterruptedException ex) {
            logger.fatal("Problem with posSensor");
            Logger.getLogger(GetNewFollowIdFromWaving.class.getName()).log(Level.SEVERE, null, ex);
        }
        if (personList != null) {
            for (PersonData p : personList) {
                PositionData pos = p.getPosition();
                if (pos != null && handPos != null) {
                    double dist = pos.getDistance(handPos, LU);
                    PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                            p.getPosition(), robotPos));

                    double angle = polar.getAngle(AngleUnit.RADIAN);
                    //unsupported logger.debug("P {" + p.getId() + "} dist:" + dist + "angle: " + angle);
                    if (dist < cur && (Math.abs(angle) < maxAngle)) {
                        cur = dist;
                        best = p;
                    }
                }
            }
        }
        return best;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                followPersonSlot.memorize(person);
            } catch (CommunicationException ex) {
                logger.fatal(ex);
                return ExitToken.fatal();
            }
        }

        return curToken;
    }

    private List<PersonData> getPersons() {
        List<PersonData> persons = null;
        try {
            persons = personSensor.readLast(5000);
        } catch (IOException | InterruptedException ex) {
            logger.warn(
                    "Exception while retrieving persons from sensor !", ex);
        }
        return persons;
    }

}
