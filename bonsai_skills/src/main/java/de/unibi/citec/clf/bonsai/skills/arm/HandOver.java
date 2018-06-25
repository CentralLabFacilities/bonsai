package de.unibi.citec.clf.bonsai.skills.arm;

import de.unibi.citec.clf.bonsai.skills.deprecated.csra.*;
import de.unibi.citec.clf.bonsai.actuators.HandOverActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.util.MapReader;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * why is this a "csra" skill?
 * 
 * @author lruegeme, semeyerz
 */
public class HandOver extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private HandOverActuator hand;

    private Future<Boolean> future;

    private static final String KEY_CHOOSE_GROUP = "#_CHOOSE_GROUP";
    private static final String KEY_TYPE = "#_TYPE";
    
    private MemorySlot<String> groupSlot;
    private boolean overrideGroup = false;    
    private String group = "left_arm";
    private int type = 1;
    
    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        hand = configurator.getActuator("HandOver", HandOverActuator.class);

        overrideGroup = configurator.requestOptionalBool(KEY_CHOOSE_GROUP, overrideGroup);
        type = configurator.requestOptionalInt(KEY_TYPE, type);
  
        if (overrideGroup){
            groupSlot = configurator.getSlot("GroupSlot", String.class);
            logger.info("using group slot!");
        }
        
    }

    @Override
    public boolean init() {

                
        if (overrideGroup) {
            try {
                String gs = groupSlot.recall();
                
                if (gs.contains("right")) { //dirty
                    group = "right_arm";
                } else {
                    logger.error("Using default planning group");
                    group = "left_arm";
                }
            } catch (CommunicationException ex) {
                Logger.getLogger(HandOver.class.getName()).log(Level.SEVERE, null, ex);
            } catch (NullPointerException ex) {
                logger.error("Using default planning group");
                group = "left_arm";
            }
        }
        
        
        try {
            future = hand.handOver(group, (byte) type);
        } catch (IOException e) {
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        while (!future.isDone()) {
            logger.info("##### hand over running...");
            return ExitToken.loop(1000);
        }

        try {
            if (future.get()) {
                return tokenSuccess;
            } else {
                return tokenError;
            }
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e.getMessage());
            return ExitToken.fatal();
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
