package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.StateID;

/**
 * @author lruegeme
 */
public interface SkillListener {

    void skillFinished(StateID id, ExitStatus token);

    void skillAborted(StateID id, Throwable e);

}
