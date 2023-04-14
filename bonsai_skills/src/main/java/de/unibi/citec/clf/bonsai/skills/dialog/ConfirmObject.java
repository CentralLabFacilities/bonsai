package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ConfirmObject extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorSaving;

    private MemorySlot<String> all_objects;

    private MemorySlot<Integer> index;
    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorSaving = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("ParsingOrderFailed"));

        all_objects = configurator.getSlot("ObjectsSlot", String.class);
        index = configurator.getSlot("IndexSlot", Integer.class);
    }

    @Override
    public boolean init() {
        try{
            int ind = index.recall();
            ind++;
            index.memorize(ind);
        }
        catch(CommunicationException ex){
            logger.error(ex.getMessage());
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        System.out.println("The current object has been removed");

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
