package de.unibi.citec.clf.bonsai.skills.knowledge.object;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.knowledgebase.RCObject;

/**
 *
 * This Skill is used to retrieve the amount of objects in a given List<RCObject>.
 * <pre>
 *
 * Options:
 * TODO DOKU
 * Slots:
 *  RCObjectListSlot: [List<RCObject>] [Read]
 *      -> Memory slot with the list of RCObject to count
 *  CountSlot: [String] [Write]
 *      -> Memory slot with number of RCObjects in the list
 *
 * ExitTokens:
 *  success:                Number of the RCObjects successfully retrieved
 *  error:                  Number of the RCObjects could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class GetObjectName extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<RCObject> rcobjectSlot;
    private MemorySlotWriter<String> nameSlot;

    private RCObject rcObject;
    private String name;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        rcobjectSlot = configurator.getReadSlot("RCObjectSlot", RCObject.class);
        nameSlot = configurator.getWriteSlot("StringSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            rcObject = rcobjectSlot.recall();

            if (rcObject == null) {
                logger.error("your RCObjectSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        name = rcObject.getName();
        if(name == null){
            return tokenError;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                nameSlot.memorize(name);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize name");
                return tokenError;
            }
        }
        return curToken;
    }
}
