package de.unibi.citec.clf.bonsai.skills.knowledge.object;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.knowledgebase.RCObject;

/**
 *
 * This Skill is used to retrieve the amount of objects in a given List<RCObject>.
 * <pre>
 *
 * Options:
 *
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
 * @author rfeldhans
 */
public class CountObjects extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<List<RCObject>> rcobjectListSlot;
    private MemorySlotWriter<String> counterSlot;

    private List<RCObject> rcObjectList;
    private String counter;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        rcobjectListSlot = configurator.getReadSlot("RCObjectListSlot", List.getListClass(RCObject.class));
        counterSlot = configurator.getWriteSlot("CountSlot", String.class);

    }

    @Override
    public boolean init() {
        try {
            rcObjectList = rcobjectListSlot.recall();

            if (rcObjectList == null) {
                logger.error("your RCObjectListSlot was empty");
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
        int size = rcObjectList.size();
        counter = "" + size;
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                counterSlot.memorize(counter);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize counter");
                return tokenError;
            }
        }
        return curToken;
    }
}
