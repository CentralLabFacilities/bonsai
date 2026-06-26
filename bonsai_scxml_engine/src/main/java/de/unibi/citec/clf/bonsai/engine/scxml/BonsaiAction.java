package de.unibi.citec.clf.bonsai.engine.scxml;

import org.apache.commons.scxml2.model.Action;
import org.apache.log4j.Logger;

public abstract class BonsaiAction extends Action {
    protected Logger logger = Logger.getLogger(this.getClass());
}
