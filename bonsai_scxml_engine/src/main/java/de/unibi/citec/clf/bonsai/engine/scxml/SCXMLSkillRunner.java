package de.unibi.citec.clf.bonsai.engine.scxml;


import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.engine.SkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.SkillListener;
import de.unibi.citec.clf.bonsai.engine.SkillRunner;
import de.unibi.citec.clf.bonsai.engine.SkillStateMachine;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.StateID;
import org.apache.log4j.Logger;

import java.util.Map;

/**
 * This class can be run in a thread and invokes the different phases while executing a skill.
 *
 * @author lziegler
 */
public class SCXMLSkillRunner implements Runnable, SkillListener {

    private final Logger logger = Logger.getLogger(getClass());

    private final SkillStateMachine statemachine;
    private final SkillRunner runner;

    /**
     * Indicates if this skill should fire an event after execution.
     */
    private boolean fireEvent = true;

    public SCXMLSkillRunner(SkillStateMachine statemachine, AbstractSkill skill, StateID state,
                            Map<String, String> vars, Map<String, String> slotXPathMapping) {
        super();
        this.statemachine = statemachine;
        this.runner = new SkillRunner(skill, state, vars, slotXPathMapping, this);
    }

    @Override
    public void run() {
        SkillConfigurator.Config defaultConf = SkillConfigurator.getDefaultConf();
        defaultConf.activateObjectAnyway = true;
        defaultConf.checkCoreCreation = false;
        defaultConf.unusedParamsAsError = true;

        try {
            this.runner.configure(defaultConf);
        } catch (ConfigurationException e) {
            logger.warn(e);
        }
        this.runner.run();
    }

    /**
     * Force this state to end as soon as possible.
     *
     * @param fireEvent <code>true</code> if this skill should fire an event after execution.
     *
     *                  <code>true</code> if the reason is a timeout.
     */
    public synchronized void forceEnd(boolean fireEvent) {
        this.fireEvent = fireEvent;
        runner.forceEnd();
    }

    /**
     * Indicates if this state has been executed.
     *
     * @return True if this state has been executed, false otherwise.
     */
    public synchronized boolean hasRunnerBeenExecuted() {
        return runner.hasBeenExecuted();
    }

    public void setPause(boolean pause) {
        runner.setPause(pause);
    }

    @Override
    public void skillFinished(StateID id, ExitStatus token) {
        if (fireEvent) {
            String event = id.getCanonicalSkill() + "." + token.getFullStatus();
            logger.debug("  " + "Fire event: " + event);
            statemachine.fireEventFromSkill(event);
        }
    }

    @Override
    public void skillAborted(StateID id, Throwable e) {
        logger.warn("  " + "skillAborted: " + id, e);
        statemachine.announceCorruptState(id, this);
        String event = id.getCanonicalSkill() + "." + ExitStatus.FATAL().getFullStatus();
        statemachine.fireEventFromSkill(event);
        statemachine.handle(e);
    }

}
