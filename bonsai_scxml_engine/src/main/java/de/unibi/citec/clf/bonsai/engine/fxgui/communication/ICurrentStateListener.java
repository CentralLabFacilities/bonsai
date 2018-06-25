package de.unibi.citec.clf.bonsai.engine.fxgui.communication;


import javafx.collections.ObservableList;

/**
 * @author lruegeme
 */
public interface ICurrentStateListener {

    void updateEventList(ObservableList values);

    void updateStateList(ObservableList values);

}
