package de.unibi.citec.clf.bonsai.skills.dialog;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;

import java.util.ArrayList;
import java.util.List;

public class ParseOrder extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorSaving;

    private MemorySlot<String> raw_string;

    private MemorySlot<String> order;

    private String order_string;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorSaving = configurator.requestExitToken(ExitStatus.ERROR().withProcessingStatus("ParsingOrderFailed"));

        raw_string = configurator.getSlot("StringSlotRaw", String.class);
        order = configurator.getSlot("StringSlotOrder", String.class);
    }

    @Override
    public boolean init() {

        List<String> objects = new ArrayList<String>();

        objects.add("master chef can");
        objects.add("cracker box");
        objects.add("sugar box");
        objects.add("tomato soup can");
        objects.add("mustard bottle");
        objects.add("tuna fish can");
        objects.add("pudding box");
        objects.add("gelatin box");
        objects.add("potted meat can");
        objects.add("pitcher base");
        objects.add("bleach cleanser");
        objects.add("bowl");
        objects.add("mug");
        objects.add("power drill");
        objects.add("wood block");
        objects.add("scissors");
        objects.add("large marker");
        objects.add("large clamp");
        objects.add("extra large clamp");
        objects.add("foam brick");

        try{
            String raw = raw_string.recall();


            for(int i=0; i<objects.size(); i++){
                String object = objects.get(i);
                 if(raw.contains(object)){
                     order_string = object;
                 }
            }

            order.memorize(order_string); //please

        } catch (CommunicationException ex){
            logger.error(ex.getMessage());
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        System.out.println("The order is: "+ order_string);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
