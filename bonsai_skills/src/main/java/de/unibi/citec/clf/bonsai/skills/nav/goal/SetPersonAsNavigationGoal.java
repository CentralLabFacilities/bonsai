package de.unibi.citec.clf.bonsai.skills.nav.goal;

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
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class SetPersonAsNavigationGoal extends AbstractSkill {

    private static final String KEY_STOP_DISTANCE = "#_STOP_DISTANCE";
    private final static LengthUnit LU = LengthUnit.MILLIMETER;
    private final static AngleUnit AU = AngleUnit.RADIAN;
    private double stopDistance = 1000; //500
    private ExitToken tokenSuccess;
    private MemorySlotReader<PersonData> personDataSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private Sensor<PositionData> posSensor;

    private PersonData person;
    private double currentPersonDistance = 0;
    private PositionData robotPosition;
    private NavigationGoalData goal;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        personDataSlot = configurator.getReadSlot("PersonDataSlot", PersonData.class);
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        posSensor = configurator.getSensor("PositionSensor", PositionData.class);

        stopDistance = configurator.requestOptionalDouble(KEY_STOP_DISTANCE, stopDistance);
    }

    @Override
    public boolean init() {
        try {
            person = personDataSlot.recall();
            robotPosition = posSensor.readLast(-1);
        } catch (InterruptedException | IOException | CommunicationException ex) {
            logger.error(ex);
            return false;
        }

        if (robotPosition == null) {
            logger.error("No robot position");
            return false;
        }

        if (person == null) {
            logger.error("No Person");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        PolarCoordinate personCoordinate = new PolarCoordinate(getLocalPosition(person.getPosition()));
        double driveDistance = calculateDriveDistance(personCoordinate);
        goal = CoordinateSystemConverter.polar2NavigationGoalData(robotPosition, personCoordinate.getAngle(AU), driveDistance, AU, LU);

        return tokenSuccess;
    }

    private double calculateDriveDistance(PolarCoordinate polar) {
        double distance;
        currentPersonDistance = polar.getDistance(LU);
        distance = currentPersonDistance - stopDistance;

        if (distance < 0) {
            distance = 0;
        }

        return distance;
    }

    private PositionData getLocalPosition(PositionData position) {
        if (position.getFrameId().equals(PositionData.ReferenceFrame.LOCAL.getFrameName())) {
            return position;
        } else {
            return CoordinateSystemConverter.globalToLocal(position, robotPosition);
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (goal != null) {
            try {
                navigationGoalDataSlot.memorize(goal);
            } catch (CommunicationException ex) {
                logger.fatal("Unable to write to memory: " + ex.getMessage());
                return ExitToken.fatal();
            }
        }
        return curToken;
    }

}