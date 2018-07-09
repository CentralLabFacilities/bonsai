package de.unibi.citec.clf.bonsai.skills.personPerception.oneshot;

import de.unibi.citec.clf.bonsai.actuators.LearnPersonActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.Future;

/**
 * Learn a person and give them a name. Learns the face of the closest person recognized by openpose - could be considered a hack because its using the learnPersonActuator with an openpose service call.
 *
 * <pre>
 *
 * Slots:
 *  NameSlot:           [String] [Read]
 *      -> The name to identify the person if #_NAME is left as null
 *
 * ExitTokens:
 *  success:    Person learned successfully
 *  error:      Person could not be learned or no response from LearnPersonActuator
 *
 * Sensors:
 *
 * Actuators:
 *  LearnPersonActuator:    [LearnPersonActuator]
 *      -> Called to learn new person
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class LearnPerson extends AbstractSkill {

    //TODO ADD TIMEOUT

    private String name;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<String> nameSlot;

    private LearnPersonActuator learnPersonActuator;

    private Future<Boolean> learnCompleted;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        learnPersonActuator = configurator.getActuator("LearnPersonActuator", LearnPersonActuator.class);
        nameSlot = configurator.getReadSlot("NameSlot", String.class);
    }

    @Override
    public boolean init() {
        if (nameSlot != null) {
            try {
                name = nameSlot.recall();
            } catch (CommunicationException ex) {
                logger.error("could not read from nameslot", ex);
                return false;
            }
        }
        learnCompleted = learnPersonActuator.learnPerson("rip uuid", name);
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!learnCompleted.isDone()) {
            return ExitToken.loop(100);
        }
        if (learnCompleted.isDone()) {
            logger.info("learnt person, name: " + name);
            return tokenSuccess;
        } else {
            return tokenError;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) { return curToken; }
}
