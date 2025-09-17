package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.io.IOException;

/**
 * Use this state get current people from sensor
 *
 * <pre>
 * options:
 *
 * slots:
 * PersonDataListSlot: [PersonDataList] [Write] -> saves the current people
 *
 * possible return states are:
 * success             -> person found
 *
 * </pre>
 *
 * @author  lruegeme
 */

public class GetPeople extends AbstractSkill {



    // used tokens
    private ExitToken tokenSuccess;

    private Sensor<PersonDataList> personSensor;

    private MemorySlotWriter<PersonDataList> currentPersonSlot;


    List<PersonData> persons;
    CoordinateTransformer tf;
    private Sensor<Pose2D> positionSensor;
    private Pose2D robotPosition;

    @Override
    public void configure(ISkillConfigurator configurator) {
        // odom -> footprint broken?
         tf = (CoordinateTransformer) configurator.getTransform();

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        positionSensor = configurator.getSensor("PositionSensor", Pose2D.class);

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);
        currentPersonSlot = configurator.getWriteSlot("PersonDataListSlot", PersonDataList.class);

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
        } catch (IOException | InterruptedException ex) {
            logger.error("Exception while retrieving stuff", ex);
            return ExitToken.fatal();
        }


        if(!persons.isEmpty() && !persons.get(0).isInBaseFrame()) {
            for (PersonData p : persons) {
                p.setPosition(getLocalPosition(p.getPosition()));
            }

        }

        PersonDataList list = new PersonDataList(persons);

        try {
            currentPersonSlot.memorize(list);
            return tokenSuccess;
        } catch (CommunicationException ex) {
            logger.fatal(
                    "Exception while storing current Person in memory!", ex);
            return ExitToken.fatal();
        }

    }

    private Pose2D getLocalPosition(Pose2D position) {
        if(position.getFrameId().equals(Pose2D.ReferenceFrame.LOCAL.getFrameName())) {
            return position;
        } else {
            return CoordinateSystemConverter.globalToLocal(position, robotPosition);
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
