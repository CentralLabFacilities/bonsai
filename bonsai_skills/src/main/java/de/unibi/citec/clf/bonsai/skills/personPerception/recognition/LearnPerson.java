package de.unibi.citec.clf.bonsai.skills.personPerception.recognition;

import de.unibi.citec.clf.bonsai.actuators.LearnPersonActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Learn a person and give them a name.
 *
 * <pre>
 *
 * Options:
 *  #_NAME:     [String] Optional (Default: null)
 *                  -> The name to identify the person. If left as null name is read from slot
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read/Write]
 *      -> The person to learn (name will be set in the process)
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
 * @author jkummert
 */
public class LearnPerson extends AbstractSkill {

    private static final String KEY_NAME = "#_NAME";

    private String name;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonData> targetPersonReadSlot;
    private MemorySlotWriter<PersonData> targetPersonWriteSlot;
    private MemorySlotReader<String> nameSlot;

    private LearnPersonActuator learnPersonActuator;

    private PersonData targetPerson;
    private Future<Boolean> learnCompleted;

    @Override
    public void configure(ISkillConfigurator configurator) {

        name = configurator.requestOptionalValue(KEY_NAME, null);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        targetPersonReadSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);
        targetPersonWriteSlot = configurator.getWriteSlot("TargetPersonSlot", PersonData.class);

        learnPersonActuator = configurator.getActuator("LearnPersonActuator", LearnPersonActuator.class);

        if (name == null) {
            logger.info("key " + KEY_NAME + " not given, using slot");
            nameSlot = configurator.getReadSlot("NameSlot", String.class);
        }
    }

    @Override
    public boolean init() {

        try {
            targetPerson = targetPersonReadSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read target id from slot.", ex);
            return false;
        }

        if (nameSlot != null) {
            try {
                name = nameSlot.recall();
            } catch (CommunicationException ex) {
                logger.error("could not read from nameslot", ex);
                return false;
            }
        }

        learnCompleted = learnPersonActuator.learnPerson(targetPerson.getUuid(), name);
        return true;
    }

    @Override
    public ExitToken execute() {
        if (!learnCompleted.isDone()) {
            return ExitToken.loop(100);
        }

        try {
            if (learnCompleted.get()) {
                targetPerson.setName(name);
                return tokenSuccess;
            } else {
                return tokenError;
            }
        } catch (InterruptedException | ExecutionException ex) {
            logger.error("No return value from learn person actuator", ex);
            return tokenError;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                targetPersonWriteSlot.memorize(targetPerson);
            } catch (CommunicationException ex) {
                logger.warn("could not write targetPerson to slot");
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
