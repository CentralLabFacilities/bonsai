package de.unibi.citec.clf.bonsai.engine.fxgui.communication;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLRemote;
import javafx.beans.property.StringProperty;

/**
 * @author lruegeme
 */
public interface FXGUISCXMLRemote extends SCXMLRemote {

    void addCurrentStateTrigger(ICurrentStateListener list);

    void addStateTrigger(IStateListener list);

    StringProperty getStatusProp();

}
