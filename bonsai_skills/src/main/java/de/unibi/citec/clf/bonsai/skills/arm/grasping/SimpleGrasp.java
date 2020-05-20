package de.unibi.citec.clf.bonsai.skills.arm.grasping;

import de.unibi.citec.clf.bonsai.actuators.ManipulationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Gasp an object by id.
 *
 * @author lruegeme
 */
public class SimpleGrasp extends AbstractSkill {

    private static final String KEY_ID = "#_ID";

    //defaults
    private String group = null;
    private String id = null;

    // used tokens   
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private ManipulationActuator graspAct;

    private MemorySlotReader<String> idSlot;

    private static final LengthUnit mm = LengthUnit.MILLIMETER;

    private Future<ManipulationActuator.MoveitResult> returnFuture;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        graspAct = configurator.getActuator("GraspActuator", ManipulationActuator.class);

        if(configurator.hasConfigurationKey(KEY_ID)) {
            id = configurator.requestValue(KEY_ID);
        } else {
            idSlot = configurator.getReadSlot("ID",String.class);
        }



    }

    @Override
    public boolean init() {

        if(idSlot != null) {
            try {
                id = idSlot.recall();
            } catch (CommunicationException e) {
                logger.error(e);
                return false;
            }
        }

        if(id == null || id.isEmpty()) {
            logger.error("got no id");
            return false;
        }

        try {
            returnFuture = graspAct.graspObject(id,group);
        } catch (IOException e) {
            logger.error(e);
            return false;
        }

        return true;


    }

    @Override
    public ExitToken execute() {

        if (!returnFuture.isDone()) {
            logger.debug("grasping is not done yet");
            return ExitToken.loop();
        }

        ManipulationActuator.MoveitResult GRT;
        try {
            GRT = returnFuture.get();
        } catch (InterruptedException | ExecutionException ex) {
            logger.fatal("could not get future after isDone");
            return ExitToken.fatal();
        }

        logger.info("Grasping: " + GRT.toString());
        switch (GRT) {
            case SUCCESS:
                return tokenSuccess;
            default:
                return tokenError;
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if(returnFuture != null && !returnFuture.isDone()) {
            returnFuture.cancel(true);
        }
        return curToken;
    }


}
