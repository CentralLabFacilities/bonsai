package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import javafx.beans.property.SimpleStringProperty

/**
 * This interface is the superinterface for all nodes, connections, joints, etc. that can be selected on the screen.
 **/
interface Selectable {
    /**
     * Type of the selectable component.
     */
    val _type: SimpleStringProperty
}