package de.unibi.citec.clf.bonsai.gui.grapheditor.api

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.GraphEditorProperties
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.RemoveContext
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorView
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import javafx.beans.property.ObjectProperty
import javafx.scene.layout.Region

/**
 * Provides functionality for displaying and editing graph-like diagrams in
 * JavaFX.
 *
 * <p>
 * Example:
 *
 * <pre>
 * <code>GModel model = GraphFactory.eINSTANCE.createGModel();
 *
 * GraphEditor graphEditor = new DefaultGraphEditor();
 * graphEditor.setModel(model);
 *
 * Region view = graphEditor.getView();</code>
 * </pre>
 *
 * The view is a {@link Region} and can be added to the JavaFX scene graph in
 * the usual way. For large graphs, the editor can be put inside a pannable
 * container (see module core) instead.
 * </p>
 *
 * <p>
 * The editor updates its underlying model via EMF commands. This means any user
 * action should be undoable. Helper methods for common operations are provided
 * in the {@link Commands} class, such as:
 *
 * <ul>
 * <li>Add Node</li>
 * <li>Clear All</li>
 * <li>Undo</li>
 * <li>Redo</li>
 * </ul>
 *
 * </p>
 *
 * <p>
 * Look and feel can be customised by setting custom skin classes. The default
 * skins can also be customised to some extent via CSS. See <b>defaults.css</b>
 * in the core module for more information.
 * </p>
 */
interface GraphEditor: GraphEditorSkins {

    /**
     * Custom connector validator.
     *
     * <p>
     * This will be used to decide which connections are allowed / forbidden during drag and drop events in the editor.
     * </p>
     */
    var connectorValidator: GConnectorValidator?

    /**
     * The graph model to be edited.
     */
    var model: GModel

    var _modelProperty: ObjectProperty<GModel>

    /**
     * The property containing the graph model being edited.
     *
     * @return a property containing the {@link GModel} being edited
     */
    fun modelProperty() = _modelProperty

    /**
     * Properties of the editor.
     *
     * <p>
     * This provides access to global properties such as:
     *
     * <ul>
     * <li>Show/hide alignment grid.</li>
     * <li>Toggle snap-to-grid on/off.</li>
     * <li>Toggle editor bounds on/off.</li>
     * </ul>
     *
     * </p>
     */
    var editorProperties: GraphEditorProperties

    /**
     * The skin lookup.
     *
     * <p>
     * The skin lookup is used to get any skin instance associated to a model element instance.
     * </p>
     */
    var skinLookup: SkinLookup

    /**
     * View where the graph is displayed and edited.
     *
     * <p>
     * The view is a JavaFX {@link Region}. It should be added to the scene
     * graph in the usual way.
     * </p>
     */
    var view: GraphEditorView

    /**
     * The selection manager.
     *
     * <p>
     * The selection manager keeps track of the selected nodes, connections,
     * etc.
     * </p>
     */
    var selectionManager: SelectionManager


    fun flush()

    /**
     * Sets a method to be called when a connection is created in the editor.
     *
     * <p>
     * This can be used to append additional commands to the one that created the connection.
     * </p>
     *
     * @param consumer a consumer to append additional commands
     */
    fun setOnConnectionCreated(consumer: (GConnection) -> Command)

    /**
     * Sets a method to be called when a connection is removed in the editor.
     *
     * <p>
     * This can be used to create additional commands to the one that removed
     * the connection.
     * </p>
     *
     * @param onConnectionRemoved
     *            a {@link BiFunction} creating the additional command
     */
    fun setOnConnectionRemoved(onConnectionRemoved: (RemoveContext, GConnection) -> Command)

    /**
     * Sets a method to be called when a node is removed in the editor.
     *
     * <p>
     * This can be used to create additional commands to the one that removed
     * the node.
     * </p>
     *
     * @param onNodeRemoved
     *            a {@link BiFunction} creating the additional command
     */
    fun setOnNodeRemoved(onNodeRemoved: (RemoveContext, GNode) -> Command)

    /**
     * Deletes all elements that are currently selected.
     *
     * @param items
     *            the items to remove from the graph
     */
    fun delete(items: Collection<Selectable>)

    /**
     * Reloads the graph model currently being edited.
     *
     * <p>
     * <b>Note: </b><br>
     * If the model is updated via EMF commands, as is recommended, it should rarely be necessary to call this method.
     * The model will be reloaded automatically via a command-stack listener.
     * </p>
     */
    fun reload()

}