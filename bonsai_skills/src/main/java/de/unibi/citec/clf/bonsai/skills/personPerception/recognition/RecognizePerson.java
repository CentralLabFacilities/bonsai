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
 * Try to recognize a person.
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  TargetPersonSlot:   [PersonData] [Read]
 *      -> The person to recognize
 *  NameSlot:           [String] [Write]
 *      -> The name of the recognized person. "unknown" if not recognized
 *
 * ExitTokens:
 *  success:            Person recognized, name written to memory
 *  success.notKnown:   Person is unknown
 *  error:              Could not call LearnPersonActuator or recieved no response
 *
 * Sensors:
 *
 * Actuators:
 *  LearnPersonActuator:    [LearnPersonActuator]
 *      -> Called to recognize a person
 *
 * </pre>
 *
 * @author jkummert
 */
public class RecognizePerson extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNotKnown;
    private ExitToken tokenError;

    private MemorySlotReader<PersonData> targetPersonSlot;
    private MemorySlotWriter<String> nameSlot;

    private LearnPersonActuator learnPersonActuator;

    private String targetID;
    private String name;
    private Future<String> recognizeCompleted;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNotKnown = configurator.requestExitToken(ExitStatus.SUCCESS().ps("notKnown"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        targetPersonSlot = configurator.getReadSlot("TargetPersonSlot", PersonData.class);

        learnPersonActuator = configurator.getActuator("LearnPersonActuator", LearnPersonActuator.class);

        nameSlot = configurator.getWriteSlot("NameSlot", String.class);
    }

    @Override
    public boolean init() {

        try {
            targetID = targetPersonSlot.recall().getUuid();
        } catch (CommunicationException ex) {
            logger.warn("Could not read target id from slot.", ex);
            return false;
        }

        recognizeCompleted = learnPersonActuator.doIKnowThatPerson(targetID);
        return true;
    }

    @Override
    public ExitToken execute() {
        while (!recognizeCompleted.isDone()) {
            return ExitToken.loop();
        }

        try {
            name = recognizeCompleted.get();
            if (name == null || name.equals("")) {
                logger.warn("Returned name was null or empty");
                return tokenError;
            }
            if (name.toLowerCase().equals("unknown")) {
                return tokenSuccessNotKnown;
            } else {
                return tokenSuccess;
            }
        } catch (InterruptedException | ExecutionException ex) {
            logger.error("Could not get response of learn person actuator", ex);
            return tokenError;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                nameSlot.memorize(name);
            } catch (CommunicationException ex) {
                logger.warn("could not write name to slot");
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
