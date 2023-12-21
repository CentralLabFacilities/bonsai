package de.unibi.citec.clf.bonsai.skills.ecwm.grasping;

/**
 * Compares an entity's type with a string (compares type)
 *
 * <pre>
 *
 * Options:
 *  entity:     [String] Optional
 *                  -> Name of the attached entity
 *  type:       [String] Optional
 *                  -> Type of the attached entity
 *  use_slot:   [Boolean] Optional
 *                  -> read the entity from the specified slot instead of creating a new one
 *
 * Slots:
 *  Entity:   [Entity] Read
 *                  -> Read: Entity to be evaluated
 *  String:   [String] Read
 *                  -> Read: The string with the desired type
 *
 * ExitTokens:
 *  success.equal:    Entity is of the given type
 *  success.unequal:    Entity is not of the given type
 *  error: Comparison did not work, for example because slot could not be read
 *
 * </pre>
 *
 * @author klammers
 */

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.ecwm.Entity;
import de.unibi.citec.clf.btl.data.speechrec.GrammarTree;

public class CompareEntity extends AbstractSkill {

    private ExitToken tokenSuccessEqual;
    private ExitToken tokenSuccessUnequal;
    private ExitToken tokenError;

    //Name of the entity "id" in the world model
    private static final String KEY_NAME = "#_NAME";

    private MemorySlotReader<Entity> entityReader;
    private MemorySlotReader<String> nameReader = null;

    private String name = null;
    private Entity entity;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccessEqual = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("equal"));
        tokenSuccessUnequal = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("unequal"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        if (configurator.hasConfigurationKey(KEY_NAME)) {
            name = configurator.requestOptionalValue(KEY_NAME, (String)name);
        } else {
            nameReader = configurator.getReadSlot("String", String.class);
        }
        logger.debug(name);
        entityReader = configurator.getReadSlot("entity", Entity.class);
    }

    @Override
    public boolean init() {
        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            entity = entityReader.recall();
            if(name == null){
                name = nameReader.recall();
            }
        } catch (CommunicationException ex) {
            logger.error("Could not recall from entity slot");
            return tokenError;
        }

        String type = entity.getType();
        logger.debug(type);

        boolean result = name.equals(type);

        if(result){
            return tokenSuccessEqual;
        } else {
            return tokenSuccessUnequal;
        }
    }

    @Override
    public ExitToken end(ExitToken exitToken) {
        return exitToken;
    }
}
