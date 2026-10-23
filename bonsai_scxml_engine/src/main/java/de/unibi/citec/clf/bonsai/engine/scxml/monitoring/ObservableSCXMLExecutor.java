package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.Context;
import org.apache.commons.scxml2.SCXMLExecutor;
import org.apache.commons.scxml2.model.EnterableState;

/** Exposes the SCXML executor's state-local contexts to runtime monitoring. */
public class ObservableSCXMLExecutor extends SCXMLExecutor {
    public Context getContextFor(EnterableState state) {
        return getSCInstance().getContext(state);
    }
}
