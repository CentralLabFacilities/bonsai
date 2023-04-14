package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

public class SplitObjects extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorSaving;

    private ExitToken tokenFinished;

    private MemorySlot<String> all_objects;

    private MemorySlot<String> current_object;

    private MemorySlot<Integer> index;

    private String[] split_objects;

    private int ind;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("Ongoing"));
        tokenErrorSaving = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("ParsingOrderFailed"));
        tokenFinished = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("Finished"));

        all_objects = configurator.getSlot("ObjectsSlot", String.class);
        index = configurator.getSlot("IndexSlot", Integer.class);
        current_object = configurator.getSlot("CurrentObjectSlot", String.class);
    }

    @Override
    public boolean init() {

        try{
            String objects = all_objects.recall();
            split_objects = objects.split(",");
            ind = index.recall();
        }
        catch(CommunicationException ex){
            logger.error(ex.getMessage());
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        try{
            int max = split_objects.length;
            if(ind>=max){
                return tokenFinished;
            }
            String current = split_objects[ind];
            current_object.memorize(current);
            return tokenSuccess;
        }
        catch(CommunicationException ex){
            logger.error(ex.getMessage());
            return tokenErrorSaving;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
