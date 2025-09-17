package de.unibi.citec.clf.bonsai.skills.nav;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;

/**
 * Find a person to follow close to the last followed person.
 * <p>
 * Possible recovery if target person was lost or got a new uuid
 *
 * <pre>
 *
 * Options:
 *  #_MAX_DIST:    [double] Optional (default: 500)
 *                      -> Max distance a person can have to the old person to be considered a new follow target in mm
 *
 * Slots:
 *  PersonDataSlot: [PersonData] [Read and Write]
 *      -> Read in last followed person. Write new person to follow.
 *
 * ExitTokens:
 *  success:    Found new person in range to follow
 *  error:      Could not find new person to follow
 *
 * Sensors:
 *  PersonSensor :  [PersonDataList]
 *      -> Read currently seen persons
 *
 * Actuators:
 *
 * </pre>
 *
 * @author lruegeme, jkummert
 */
public class GetNewFollowId extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private static final String KEY_USE_PERSON_SLOT = "use_person_slot";
    private static final String KEY_MAX_DISTANCE = "#_MAX_DIST";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private long timeout = 0;
    private double maxDist = 500;

    private static final LengthUnit LU = LengthUnit.MILLIMETER;

    private Sensor<PersonDataList> personSensor;

    private MemorySlotReader<Pose2D> positionSlotRead;
    private MemorySlotReader<PersonData> followPersonRead = null;
    private MemorySlotWriter<PersonData> followPersonSlotWrite;

    private Pose2D personPos;
    private PersonData target;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        if (configurator.requestOptionalBool(KEY_USE_PERSON_SLOT, false)) {
            followPersonRead = configurator.getReadSlot("PersonInput", PersonData.class);
        } else {
            positionSlotRead = configurator.getReadSlot("LastPersonPositionSlot", Pose2D.class);
        }

        personSensor = configurator.getSensor("PersonSensor", PersonDataList.class);


        followPersonSlotWrite = configurator.getWriteSlot("PersonDataSlot", PersonData.class);

        maxDist = configurator.requestOptionalDouble(KEY_MAX_DISTANCE, maxDist);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
    }

    @Override
    public boolean init() {
        try {

            if (followPersonRead != null) {
                PersonData p = followPersonRead.recall();
                personPos = p.getPosition();
            } else {
                personPos = positionSlotRead.recall();
            }

        } catch (CommunicationException ex) {
            logger.error("Could not read person to follow from slot", ex);
            return false;
        }

        timeout += Time.currentTimeMillis();

        logger.debug("Last known position: " + personPos);
        return personPos != null;
    }

    @Override
    public ExitToken execute() {
        target = findClosestToPosition(personPos, maxDist);

        if (target != null) {
            logger.info("new target: " + target.toString());
            return tokenSuccess;
        }

        if (Time.currentTimeMillis() > timeout) {
            return tokenError;
        } else {
            return ExitToken.loop(200);
        }


    }

    public PersonData findClosestToPosition(Pose2D old, double maxDist) {
        double cur = maxDist;
        PersonData best = null;
        List<PersonData> personList = getPersons();
        if (personList != null) {
            for (PersonData p : personList) {
                Pose2D pos = p.getPosition();
                double dist = pos.getDistance(old, LU);
                logger.debug("Person: " + p);
                logger.debug("Person dist: " + dist);

                if (dist < cur) {
                    cur = dist;
                    best = p;
                }
            }
        }
        return best;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                followPersonSlotWrite.memorize(target);
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
            persons = personSensor.readLast(500);
        } catch (IOException | InterruptedException ex) {
            logger.error("Exception while retrieving persons from sensor !", ex);
        }
        return persons;
    }
}
