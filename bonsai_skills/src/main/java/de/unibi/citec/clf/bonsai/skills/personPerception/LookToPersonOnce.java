package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GazeActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * turns head towards a person once.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read]
 *      -> Read in person to look towards
 *
 * ExitTokens:
 *  error.notFound:      person was lost
 *
 * Sensors:
 *  PersonSensor:       [PersonDataList]
 *      -> Read in currently seen persons
 *  PositionSensor:     [PositionData]
 *      -> Read current robot position
 *
 * Actuators:
 *  GazeActuator: [GazeActuator]
 *      -> Called to execute head movements
 *
 * </pre>
 *
 *
 * @author jkummert
 */
public class LookToPersonOnce extends AbstractSkill {

    private ExitToken tokenErrorNotFound;
    private ExitToken tokenSuccess;

    private MemorySlotReader<PersonData> targetPersonSlot;

    private final static AngleUnit rad = AngleUnit.RADIAN;
    private final static LengthUnit m = LengthUnit.METER;

    private GazeActuator gazeActuator;

    private Sensor<PersonDataList> personSensor;
    private Sensor<PositionData> positionSensor;

    private List<PersonData> currentPersons;
    private String targetID;
    private PositionData robotPos;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenErrorNotFound = configurator.requestExitToken(ExitStatus.ERROR().ps("notFound"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        targetPersonSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);

        gazeActuator = configurator.getActuator("GazeActuator", GazeActuator.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {

        PersonData target;
        try {
            targetID = targetPersonSlot.recall().getUuid();
            target = targetPersonSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn("Could not read target id from slot.", ex);
            return false;
        }
        logger.debug("personInFrontUuid: " + targetID);
        logger.debug("position: y: " + target.getPosition().getY(m) + " x: " + target.getPosition().getX(m));

        return true;
    }

    @Override
    public ExitToken execute() {

        try {
            currentPersons = personSensor.readLast(-1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from person sensor.", ex);
            return tokenErrorNotFound;
        }
        
        try {
            robotPos = positionSensor.readLast(1);
        } catch (IOException | InterruptedException ex) {
            logger.warn("Could not read from position sensor.", ex);
            return ExitToken.loop(50);
        }

        if (currentPersons == null) {
            logger.debug("Person list null");
            return ExitToken.loop(50);
        }

        for (int i = 0; i < currentPersons.size(); ++i) {
            logger.debug("currentPerson: " + currentPersons.get(i).getUuid());
            logger.debug("currentPosition: y: " + currentPersons.get(i).getPosition().getY(m) + " x: " + currentPersons.get(i).getPosition().getX(m));
            if (currentPersons.get(i).getUuid().equals(targetID)) {
                PositionData posData = currentPersons.get(i).getPosition();

                PositionData posDataLocal = CoordinateSystemConverter.globalToLocal(posData, robotPos);

                PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                        currentPersons.get(i).getPosition(), robotPos));

                double horizontal = polar.getAngle(rad);
                //double horizontal = Math.atan2(posDataLocal.getY(LengthUnit.METER), posDataLocal.getX(LengthUnit.METER));
                double vertical = Math.atan2(-0.25, posDataLocal.getX(LengthUnit.METER));

                logger.debug("horizontal: " + horizontal);
                logger.debug("vertical" + vertical);

                gazeActuator.setGazeTargetAsync((float) vertical, (float) horizontal, (float)1.0);
            }
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
