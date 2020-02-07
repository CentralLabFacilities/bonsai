package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Give certain characteristic of closest person.
 *
 * @author jkummert
 */
public class describePerson extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenSuccess;

    /*
     * Slots used by this state.
     */
    private MemorySlot<String> descriptionSlot;
    String description;

    private MemorySlot<String> resultSlot;
    String result;

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
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noPeople"));
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        // Initialize slots
        descriptionSlot = configurator.getSlot("StringSlot", String.class);
        resultSlot = configurator.getSlot("ResultSlot", String.class);

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
            Logger.getLogger(describePerson.class.getName()).log(Level.SEVERE, null, ex);
        }

        if (peopleList.isEmpty()) {
            return tokenSuccessNoPeople;
        }

        double minDist = 0;
        BodySkeleton closest = new BodySkeleton();
        for (BodySkeleton spookySkeleton : peopleList) {
            double dist = spookySkeleton.getDistanceToRobot();
            if (minDist > dist) {
                minDist = dist;
                closest = spookySkeleton;
            }
        }

        switch (description) {
            case "gender":
                result = closest.getGender().getGenderName();
                break;
            case "pose":
                result = closest.getPose().getPoseName();
                break;
            default:
                logger.error("Unknown kind of people description: " + description);
                return tokenError;
        }*/
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (result != null) {
            try {
                resultSlot.memorize(result);
            } catch (CommunicationException ex) {
                Logger.getLogger(describePerson.class.getName()).log(Level.SEVERE, null, ex);
            }
        }
        return curToken;
    }

}
