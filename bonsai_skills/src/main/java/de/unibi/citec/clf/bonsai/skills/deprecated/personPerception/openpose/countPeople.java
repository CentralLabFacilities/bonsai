package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.PositionData;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Count the number of people that match a description.
 *
 * @author jkummert
 */
public class countPeople extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccess;

    /*
     * Slots used by this state.
     */
    private MemorySlot<String> descriptionSlot;
    String description;

    private MemorySlot<String> resultSlot;
    Integer result;

    private MemorySlot<String> reportSlot;
    private String report;

    /*
     * Sensors used by this state.
     */
    private Sensor<PositionData> positionSensor;
    private PositionData robotPos;

    /*
     * Actuators used by this state.
     */
    //private DetectPeopleActuator detectPeopleActuator;
    //List<BodySkeleton> peopleList;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        // Initialize slots
        descriptionSlot = configurator.getSlot("StringSlot", String.class);
        resultSlot = configurator.getSlot("PersonCount", String.class);
        reportSlot = configurator.getSlot("PersonCountReport", String.class);

        // Initialize actuators
        //detectPeopleActuator = configurator.getActuator("DetectPeopleActuator", DetectPeopleActuator.class);
        
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);
    }

    @Override
    public boolean init() {
        logger.debug("Searching Persons for description");
        try {
            description = descriptionSlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Could not recall people description");
            return false;
        }
        try {
            robotPos = positionSensor.readLast(1000);
        } catch (IOException | InterruptedException ex) {
            Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
        }
        return true;
    }

    @Override
    public ExitToken execute() {
/*
        peopleList = new List(BodySkeleton.class);
        try {
            peopleList = detectPeopleActuator.getPeople();
        } catch (InterruptedException | ExecutionException ex) {
            Logger.getLogger(countPeople.class.getName()).log(Level.SEVERE, null, ex);
        }

        switch (description) {

            case "sitting":
                result = countPosePersons(BodySkeleton.Posture.SITTING);
                break;
            case "standing":
                result = countPosePersons(BodySkeleton.Posture.STANDING);
                break;
            case "lying":
                result = countPosePersons(BodySkeleton.Posture.LYING);
                break;
            case "men":
            case "boys":
            case "male persons":
                result = countGenderPersons(BodySkeleton.Gender.MALE);
                break;
            case "women":
            case "girls":
            case "female persons":
                result = countGenderPersons(BodySkeleton.Gender.FEMALE);
                break;
            default:
                logger.error("Not a known people description: " + description);
                return tokenError;
        }*/
        return tokenSuccess;
    }
/*
    Integer countPosePersons(BodySkeleton.Posture pose) {
        int count = 0;
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getPose().equals(pose)) {
                ++count;
            }
        }
        return count;
    }

    Integer countGenderPersons(BodySkeleton.Gender gender) {
        int count = 0;
        for (BodySkeleton spookySkeleton : peopleList) {
            if (spookySkeleton.getGender().equals(gender)) {
                ++count;
            }
        }
        return count;
    }
*/
    @Override
    public ExitToken end(ExitToken curToken) {
        if (result != null) {
            try {
                resultSlot.memorize(result.toString());
            } catch (CommunicationException ex) {
                Logger.getLogger(countPeople.class.getName()).log(Level.SEVERE, null, ex);
            }
            if (result == 1) {
                report = "I saw " + result + " " + description + " person";
            } else {
                report = "I saw " + result + " " + description + "persons";
            }
            try {
                reportSlot.memorize(report);
            } catch (CommunicationException ex) {
                logger.error("Report could not be saved");
            }
        }
        return curToken;
    }

}
