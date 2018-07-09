package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

/**
 * creates an empty objectshapelist and saves it in the slot
 * I know this is borderline retarded but it is needed
 *
 * @author pvonneumanncosel
 */
public class EmptyObjListSlot extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<ObjectShapeList> objectShapeListSlot;

    private ObjectShapeList objectShapeList;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectShapeListSlot = configurator.getWriteSlot("ObjectShapeListSlot", ObjectShapeList.class);
    }

    @Override
    public boolean init() {
        objectShapeList = new ObjectShapeList();
        return true;
    }

    @Override
    public ExitToken execute() { return tokenSuccess; }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccess)) {
            try {
                objectShapeListSlot.memorize(objectShapeList);
            } catch (CommunicationException ex) {
                logger.error("Could not save objects shape list");
                return tokenError;
            }
        }
        return tokenSuccess;
    }
}
