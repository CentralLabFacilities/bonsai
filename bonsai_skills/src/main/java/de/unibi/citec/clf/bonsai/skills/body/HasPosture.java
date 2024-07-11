package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.PostureActuator;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Checks for a prerecorded pose.
 * 
 * @author lruegeme
 *
 *
 */
public class HasPosture extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessYes;
    private ExitToken tokenSuccessNo;
    private static final String KEY_POSE = "#_POSE";
    private static final String KEY_GROUP = "#_GROUP";

    //default values
    private String pose;
    private String group = null;

    private PostureActuator poseActuator;
    private Future<Boolean> ret;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessYes = configurator.requestExitToken(ExitStatus.SUCCESS().ps("yes"));
        tokenSuccessNo = configurator.requestExitToken(ExitStatus.SUCCESS().ps("no"));

        poseActuator = configurator.getActuator("PostureActuator", PostureActuator.class);

        pose = configurator.requestValue(KEY_POSE);
        group = configurator.requestOptionalValue(KEY_GROUP, group);

    }

    @Override
    public boolean init() {
        ret = poseActuator.isInPose(pose, group);
        return true;
    }

    @Override
    public ExitToken execute() {

        if (!ret.isDone()) {
            return ExitToken.loop(50);
        }

        try {
            if(ret.get()) return tokenSuccessYes;
            else return tokenSuccessNo;
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
        }

        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
