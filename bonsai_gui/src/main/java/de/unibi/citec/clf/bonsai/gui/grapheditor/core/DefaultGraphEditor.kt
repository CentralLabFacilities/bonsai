package de.unibi.citec.clf.bonsai.gui.grapheditor.core

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.RemoveContext
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.ConnectionEventManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.GraphEditorSkinManager
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import javafx.beans.property.ObjectProperty
import javafx.beans.property.ObjectPropertyBase
import javafx.util.Callback

/**
 * Default implementation of the {@link GraphEditor}.
 */
class DefaultGraphEditor(override var editorProperties: GraphEditorProperties = GraphEditorProperties()): GraphEditor {
    override var view: GraphEditorView
    private val connectionEventManager = ConnectionEventManager()
    private val skinManager: GraphEditorSkinManager
    private val controller: GraphEditorController<DefaultGraphEditor>

    override var nodeSkinFactory: Callback<GNode, GNodeSkin>
        get() = skinManager.nodeSkinFactory
        set(value) {skinManager.nodeSkinFactory = value}

    override var connectorSkinFactory: Callback<GConnector, GConnectorSkin>
        get() = skinManager.connectorSkinFactory
        set(value) {skinManager.connectorSkinFactory = value}

    override var connectionSkinFactory: Callback<GConnection, GConnectionSkin>
        get() = skinManager.connectionSkinFactory
        set(value) {skinManager.connectionSkinFactory = value}

    override var jointSkinFactory: Callback<GJoint, GJointSkin>
        get() = skinManager.jointSkinFactory
        set(value) {skinManager.jointSkinFactory = value}

    override var tailSkinFactory: Callback<GConnector, GTailSkin>
        get() = skinManager.tailSkinFactory
        set(value) {skinManager.tailSkinFactory = value}

    override var connectorValidator: GConnectorValidator?
        get() = controller.connectorValidator
        set(value) {controller.connectorValidator = value}

    override var skinLookup: SkinLookup
        get() = skinManager
        set(value) {}

    override var selectionManager: SelectionManager
        get() = controller.selectionManager
        set(value) {}


    override var _modelProperty: ObjectProperty<GModel> = object : ObjectPropertyBase<GModel>() {
        override fun getBean(): Any {
            return this@DefaultGraphEditor
        }
        override fun getName(): String {
            return "model"
        }
    }
    override fun modelProperty() = _modelProperty
    override var model: GModel
        get() = _modelProperty.get()
        set(value) = _modelProperty.set(value)

    init {
        model = GModel()
        view = GraphEditorView(editorProperties)
        skinManager = GraphEditorSkinManager(this, view)
        controller = GraphEditorController(this, skinManager, view, connectionEventManager, editorProperties)
        val connectionLayouter = controller.connectionLayouter
        view.connectionLayouter = connectionLayouter
        skinManager.connectionLayouter = connectionLayouter
    }

    override fun reload() {
    }

    override fun setOnConnectionCreated(consumer: (GConnection) -> Command) {
        connectionEventManager.setOnConnectionCreated(consumer)
    }

    override fun setOnConnectionRemoved(onConnectionRemoved: (RemoveContext, GConnection) -> Command) {
        connectionEventManager.setOnConnectionRemoved(onConnectionRemoved)
        controller.modelEditingManager.setOnConnectionRemoved(onConnectionRemoved)
    }

    override fun setOnNodeRemoved(onNodeRemoved: (RemoveContext, GNode) -> Command) {
        controller.modelEditingManager.setOnNodeRemoved(onNodeRemoved)
    }

    override fun delete(items: Collection<Selectable>) {
        controller.modelEditingManager.remove(items)
    }

    override fun flush() {
    }


}