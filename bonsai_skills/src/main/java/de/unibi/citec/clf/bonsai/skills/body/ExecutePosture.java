package de.unibi.citec.clf.bonsai.skills.body;

import de.unibi.citec.clf.bonsai.actuators.PostureActuator;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.concurrent.Future;

/**
 * Executes a prerecorded movement.
 * 
 * @author lruegeme
 *
 *
 */
public class ExecutePosture extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    private static final String KEY_BLOCKING = "#_BLOCKING";
    private static final String KEY_POSE = "#_POSE";
    private static final String KEY_GROUP = "#_GROUP";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    //default values
    private boolean blocking = true;
    private String pose;
    private String group = null;
    private long timeout = 10000;

    private PostureActuator poseActuator;
    private Future<Boolean> ret;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        poseActuator = configurator.getActuator("PostureActuator", PostureActuator.class);

        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);
        pose = configurator.requestValue(KEY_POSE);
        group = configurator.requestOptionalValue(KEY_GROUP, group);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int)timeout);

    }

    @Override
    public boolean init() {
        if(!blocking) logger.warn("EXECUTE NONBLOCKING POSTURE, CAREFUL");
        timeout += Time.currentTimeMillis();
        ret = poseActuator.executeMotion(pose, group);
        return true;
    }

    @Override
    public ExitToken execute() {
        if(!blocking){
            return tokenSuccess;
        }
        logger.debug("check ret is done..");
        if (!ret.isDone()) {
            if (timeout < Time.currentTimeMillis()) {
                return ExitToken.fatal();
            }
            return ExitToken.loop(50);
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

}
