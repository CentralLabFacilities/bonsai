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
 *
 * <pre>
 *
 * Options:
 *  use_person_slot      [Boolean] Optional (Default: false)
 *                          -> If true, read the previously followed person from
 *                             the PersonInput slot.
 *                          -> If false, read the previously known position from
 *                             the LastPersonPositionSlot.
 *
 *  #_MAX_DIST           [double] Optional (Default: 500)
 *                          -> Maximum distance in mm at which a person can be
 *                             considered as a new follow target.
 *
 *  #_TIMEOUT            [int] Optional (Default: 0)
 *                          -> Maximum time in ms to search for a new follow
 *                             target.
 *                          -> If 0, the skill does not wait and immediately
 *                             returns error if no person is found.
 *
 * Slots:
 *  PersonInput:         [PersonData] [Read] Optional
 *                          -> Previously followed person.
 *                          -> Used when use_person_slot is true.
 *
 *  LastPersonPositionSlot: [Pose2D] [Read] Optional
 *                          -> Last known position of the previously followed
 *                             person.
 *                          -> Used when use_person_slot is false.
 *
 *  PersonDataSlot:      [PersonData] [Write]
 *                          -> The newly selected person to follow.
 *
 * Sensors:
 *  PersonSensor:        [PersonDataList]
 *                          -> Provides the currently detected persons.
 *
 * Actuators:
 *
 * ExitTokens:
 *  success:
 *      A new person was found within #_MAX_DIST and stored in
 *      PersonDataSlot.
 *
 *  error:
 *      No person was found within #_MAX_DIST before the timeout expired.
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
