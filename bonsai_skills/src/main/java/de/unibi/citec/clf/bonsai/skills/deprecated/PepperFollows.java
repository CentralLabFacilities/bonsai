package de.unibi.citec.clf.bonsai.skills.deprecated;

import de.unibi.citec.clf.bonsai.actuators.FollowPeopleActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.person.PersonData;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

public class PepperFollows extends AbstractSkill {

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenErrorLost;

    private FollowPeopleActuator followActuator;
    Future<Boolean> result;
    private MemorySlot<PersonData> followPersonSlot;
    private SpeechActuator speechActuator;
    private PersonData personFollow;



    //private static final String KEY_PERSON_LOST_TIMEOUT = "#_PERSON_LOST_TIMEOUT";

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        // request all tokens that you plan to return from other methods
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenErrorLost = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("lost"));
        //tokenErrorPathBlocked = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("pathBlocked"));

        followActuator = configurator.getActuator("FollowPeopleActuator", FollowPeopleActuator.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        followPersonSlot = configurator.getSlot("FollowPersonSlot", PersonData.class);
    }

    @Override
    public boolean init() {
        try {
            // check for person to follow from memory
            personFollow = followPersonSlot.recall();
        } catch (CommunicationException ex) {
            logger.warn("Exception while retrieving person to follow from memory!", ex);
        }
        if (personFollow == null) {
            logger.error("No person to follow in memory");
            return false;
        }


        String uuid = personFollow.getUuid();
        logger.info("Following person with UUID: " + uuid);
        try {
            result = followActuator.startFollowing(uuid);
            return true;
        } catch (InterruptedException ex) {
            logger.fatal(ex);
            return false;
        } catch (ExecutionException ex) {
            logger.fatal(ex);
            return false;
        }
    }

    @Override
    public ExitToken execute() {

        while(!result.isDone()) {
            return ExitToken.loop();
        }

        try {
            if(result.get()) {
                //person lost
                //TODO: backup behavior
                return tokenErrorLost;
            }
        } catch (InterruptedException e) {
            logger.fatal(e);
            return tokenError;
        } catch (ExecutionException e) {
            logger.fatal(e);
            return tokenError;
        }
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        followActuator.cancel();
        return curToken;
    }
}
