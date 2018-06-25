package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.io.IOException;

/**
 * Use this state to check if there are enough people in the robots range.
 *
 * @author hneumann
 */
public class CheckIfPersonsInRange extends AbstractSkill {

    private static final String KEY_MAX_DIST = "#_MAX_DIST";
    private static final String KEY_MAX_PERSONS = "#_MAX_PERSONS";
    //defaults
    private int maxPersons = 6;
    private double maxDist = 90;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNotInRange;

    private Sensor<List<PersonData>> personSensor;
    private Sensor<PositionData> positionSensor;

    PersonData personInFront = null;
    List<PersonData> persons;
    PositionData robotPosition;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNotInRange = configurator.requestExitToken(ExitStatus.SUCCESS().ps("NotInRange"));

        personSensor = configurator.getSensor("PersonSensor", List.getListClass(PersonData.class));
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        maxDist = configurator.requestOptionalDouble(KEY_MAX_DIST, maxDist);
        maxPersons = configurator.requestOptionalInt(KEY_MAX_PERSONS, maxPersons);

    }

    @Override
    public boolean init() {

        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            persons = personSensor.readLast(200);
            robotPosition = positionSensor.readLast(200);

            PolarCoordinate polar;

            for (int i = 0; i < persons.size() && i < maxPersons; i++) {
                PersonData person = persons.get(i);
                PersonHelper.sortPersonsByDistance(persons, robotPosition);
                polar = new PolarCoordinate(MathTools.globalToLocal(
                        person.getPosition(), robotPosition));
                if (polar.getDistance(LengthUnit.CENTIMETER) > maxDist) {
                    logger.debug("Person not in range");
                    return tokenSuccessNotInRange;
                }
            }
        } catch (IOException | InterruptedException ex) {
            logger.error("Exception while retrieving stuff", ex);
            return ExitToken.fatal();
        }

        return tokenSuccess;

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return curToken;
    }
}
