package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.clear
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.redo
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.undo
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.DefaultGraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.SimpleConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorContainer
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.DefaultSkinController
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.SkinController
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.TreeSkinController
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled.TitledSkinConstants
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.TreeConnectorValidator
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.TreeSkinConstants
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils.AwesomeIcon
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.TitledSkinController
import javafx.application.Platform
import javafx.beans.property.ObjectProperty
import javafx.beans.property.SimpleObjectProperty
import javafx.beans.value.ChangeListener
import javafx.beans.value.ObservableValue
import javafx.collections.SetChangeListener
import javafx.fxml.FXML
import javafx.geometry.Pos
import javafx.geometry.Side
import javafx.scene.control.*
import javafx.scene.layout.AnchorPane

/**
 * Controller for the [GraphEditorDemo] application.
 */
class GraphEditorDemoController {
    @FXML
    private lateinit var root: AnchorPane

    @FXML
    private lateinit var menuBar: MenuBar

    @FXML
    private lateinit var addConnectorButton: MenuItem

    @FXML
    private lateinit var clearConnectorsButton: MenuItem

    @FXML
    private lateinit var connectorTypeMenu: Menu

    @FXML
    private lateinit var connectorPositionMenu: Menu

    @FXML
    private lateinit var inputConnectorTypeButton: RadioMenuItem

    @FXML
    private lateinit var outputConnectorTypeButton: RadioMenuItem

    @FXML
    private lateinit var leftConnectorPositionButton: RadioMenuItem

    @FXML
    private lateinit var rightConnectorPositionButton: RadioMenuItem

    @FXML
    private lateinit var topConnectorPositionButton: RadioMenuItem

    @FXML
    private lateinit var bottomConnectorPositionButton: RadioMenuItem

    @FXML
    private lateinit var showGridButton: RadioMenuItem

    @FXML
    private lateinit var snapToGridButton: RadioMenuItem

    @FXML
    private lateinit var readOnlyMenu: Menu

    @FXML
    private lateinit var defaultSkinButton: RadioMenuItem

    @FXML
    private lateinit var treeSkinButton: RadioMenuItem

    @FXML
    private lateinit var titledSkinButton: RadioMenuItem

    @FXML
    private lateinit var intersectionStyle: Menu

    @FXML
    private lateinit var gappedStyleButton: RadioMenuItem

    @FXML
    private lateinit var detouredStyleButton: RadioMenuItem

    @FXML
    private lateinit var minimapButton: ToggleButton

    @FXML
    private lateinit var graphEditorContainer: GraphEditorContainer

    private val graphEditor: GraphEditor = DefaultGraphEditor()
    private val selectionCopier: SelectionCopier = SelectionCopier(graphEditor.skinLookup,
            graphEditor.selectionManager)
    private val graphEditorPersistence: GraphEditorPersistence = GraphEditorPersistence()
    private var defaultSkinController: DefaultSkinController? = null
    private var treeSkinController: TreeSkinController? = null
    private var titledSkinController: TitledSkinController? = null
    private val activeSkinController: ObjectProperty<SkinController?> = object : SimpleObjectProperty<SkinController?>() {
        override fun invalidated() {
            super.invalidated()
            if (get() != null) {
                get()?.activate()
            }
        }
    }

    /**
     * Called by JavaFX when FXML is loaded.
     */
    fun initialize() {
        val model = GModel()
        graphEditor.model = model
        graphEditorContainer.graphEditor = graphEditor
        setDetouredStyle()
        graphEditorContainer.let {
            defaultSkinController = DefaultSkinController(graphEditor, it)
            treeSkinController = TreeSkinController(graphEditor, it)
            titledSkinController = TitledSkinController(graphEditor, it)
        }

        activeSkinController.set(titledSkinController)
        graphEditor.modelProperty().addListener { _, _, n: GModel -> selectionCopier.initialize(n) }
        selectionCopier.initialize(model)
        initializeMenuBar()
        addActiveSkinControllerListener()
    }

    /**
     * Pans the graph editor container to place the window over the center of the
     * content.
     *
     *
     *
     * Only works after the scene has been drawn, when getWidth() and getHeight()
     * return non-zero values.
     *
     */
    fun panToCenter() {
        graphEditorContainer.panTo(Pos.CENTER)
    }

    @FXML
    fun load() {
        graphEditorPersistence.loadFromFile(graphEditor)
        checkSkinType()
    }

    @FXML
    fun loadSample() {
        defaultSkinButton.isSelected = true
        setDefaultSkin()
        graphEditorPersistence.loadSample(graphEditor)
    }

    @FXML
    fun loadSampleLarge() {
        defaultSkinButton.isSelected = true
        setDefaultSkin()
        graphEditorPersistence.loadSampleLarge(graphEditor)
    }

    @FXML
    fun loadTree() {
        treeSkinButton.isSelected = true
        setTreeSkin()
        graphEditorPersistence.loadTree(graphEditor)
    }

    @FXML
    fun loadTitled() {
        titledSkinButton.isSelected = true
        setTitledSkin()
        graphEditorPersistence.loadTitled(graphEditor)
    }

    @FXML
    fun save() {
        graphEditorPersistence.saveToFile(graphEditor)
    }

    @FXML
    fun clearAll() {
        clear(graphEditor.model)
    }

    @FXML
    fun exit() {
        Platform.exit()
    }

    @FXML
    fun undo() {
        undo(graphEditor.model)
    }

    @FXML
    fun redo() {
        redo(graphEditor.model)
    }

    @FXML
    fun copy() {
        selectionCopier.copy()
    }

    @FXML
    fun paste() {
        activeSkinController.get()?.handlePaste(selectionCopier)
    }

    @FXML
    fun selectAll() {
        activeSkinController.get()?.handleSelectAll()
    }

    @FXML
    fun deleteSelection() {
        val selection: List<Selectable> = ArrayList(graphEditor.selectionManager.selectedItems)
        graphEditor.delete(selection)
    }

    @FXML
    fun addNode() {
        activeSkinController.get()?.addNode(graphEditor.view.localToSceneTransform.mxx)
    }

    @FXML
    fun addConnector() {
        inputConnectorTypeButton.let { activeSkinController.get()?.addConnector(selectedConnectorPosition, it.isSelected) }
    }

    @FXML
    fun clearConnectors() {
        activeSkinController.get()?.clearConnectors()
    }

    @FXML
    fun setDefaultSkin() {
        activeSkinController.set(defaultSkinController)
    }

    @FXML
    fun setTreeSkin() {
        activeSkinController.set(treeSkinController)
    }

    @FXML
    fun setTitledSkin() {
        activeSkinController.set(titledSkinController)
    }

    @FXML
    fun setGappedStyle() {
        graphEditor.editorProperties.customProperties.remove(SimpleConnectionSkin.SHOW_DETOURS_KEY)
        graphEditor.reload()
    }

    @FXML
    fun setDetouredStyle() {
        val customProperties: MutableMap<String, String> = graphEditor.editorProperties.customProperties ?: mutableMapOf()
        customProperties[SimpleConnectionSkin.SHOW_DETOURS_KEY] = true.toString()
        graphEditor.reload()
    }

    @FXML
    fun toggleMinimap() {
        minimapButton.let{graphEditorContainer.minimap.visibleProperty()?.bind(it.selectedProperty())}
    }

    /**
     * Initializes the menu bar.
     */
    private fun initializeMenuBar() {

        val skinGroup = ToggleGroup()
        skinGroup.toggles.addAll(defaultSkinButton, treeSkinButton, titledSkinButton)

        val connectionStyleGroup = ToggleGroup()
        connectionStyleGroup.toggles.addAll(gappedStyleButton, detouredStyleButton)

        val connectorTypeGroup = ToggleGroup()
        //connectorTypeGroup.toggles += inputConnectorTypeButton
        // connectorTypeGroup.toggles += outputConnectorTypeButton
        connectorTypeGroup.toggles.addAll(inputConnectorTypeButton, outputConnectorTypeButton)

        val positionGroup = ToggleGroup()
        positionGroup.toggles.addAll(leftConnectorPositionButton, rightConnectorPositionButton, topConnectorPositionButton, bottomConnectorPositionButton)
        //positionGroup.toggles.addAll(topConnectorPositionButton, bottomConnectorPositionButton)
        showGridButton.let {
            graphEditor.editorProperties.gridVisibleProperty().bind(it.selectedProperty())
        }
        snapToGridButton.let {
            graphEditor.editorProperties.snapToGridProperty().bind(it.selectedProperty())
        }

        for (type in EditorElement.entries) {
            val readOnly = CheckMenuItem(type.name)
            graphEditor.editorProperties.readOnlyProperty(type).bind(readOnly.selectedProperty())
            readOnlyMenu.items?.add(readOnly)
        }
        minimapButton.graphic = AwesomeIcon.MAP.node()
        val selectedNodesListener: SetChangeListener<in Selectable?> = SetChangeListener { checkConnectorButtonsToDisable() }
        graphEditor.selectionManager.selectedItems.addListener(selectedNodesListener)
        checkConnectorButtonsToDisable()
    }

    /**
     * Adds a listener to make changes to available menu options when the skin type changes.
     */
    private fun addActiveSkinControllerListener() {
        activeSkinController.addListener(ChangeListener<SkinController?> { _: ObservableValue<out SkinController?>?, _: SkinController?, _: SkinController? -> handleActiveSkinControllerChange() })
    }

    /**
     * Enables & disables certain menu options and sets CSS classes based on the new skin type that was set active.
     */
    private fun handleActiveSkinControllerChange() {
        if (treeSkinController?.equals(activeSkinController.get()) == true) {
            graphEditor.connectorValidator = TreeConnectorValidator()
            graphEditor.view.styleClass.remove(STYLE_CLASS_TITLED_SKINS)
            treeSkinButton?.isSelected = true
        } else if (titledSkinController?.equals(activeSkinController.get()) == true) {
            graphEditor.connectorValidator = null
            if (!graphEditor.view.styleClass.contains(STYLE_CLASS_TITLED_SKINS)) {
                graphEditor.view.styleClass.add(STYLE_CLASS_TITLED_SKINS)
            }
            titledSkinButton?.isSelected = true
        } else {
            graphEditor.connectorValidator = null
            graphEditor.view.styleClass.remove(STYLE_CLASS_TITLED_SKINS)
            defaultSkinButton?.isSelected = true
        }

        // Demo does not currently support mixing of skin types. Skins don't know how to cope with it.
        clearAll()
        flushCommandStack()
        checkConnectorButtonsToDisable()
        selectionCopier.clearMemory()
    }

    /**
     * Crudely inspects the model's first node and sets the new skin type accordingly.
     */
    private fun checkSkinType() {
        if (!graphEditor.model.nodes.isEmpty()) {
            val firstNode = graphEditor.model.nodes[0]
            val type = firstNode.type
            if (TreeSkinConstants.TREE_NODE == type) {
                activeSkinController.set(treeSkinController)
            } else if (TitledSkinConstants.TITLED_NODE == type) {
                activeSkinController.set(titledSkinController)
            } else {
                activeSkinController.set(defaultSkinController)
            }
        }
    }

    /**
     * Checks if the connector buttons need disabling (e.g. because no nodes are selected).
     */
    private fun checkConnectorButtonsToDisable() {
        val nothingSelected = graphEditor.selectionManager.selectedItems.stream()
                .noneMatch { e: Selectable? -> e is GNode }
        val treeSkinActive: Boolean = treeSkinController?.equals(activeSkinController.get()) ?: false
        val titledSkinActive: Boolean = titledSkinController?.equals(activeSkinController.get()) ?: false
        if (titledSkinActive || treeSkinActive) {
            addConnectorButton.isDisable = true
            clearConnectorsButton.isDisable = true
            connectorTypeMenu.isDisable = true
            connectorPositionMenu.isDisable = true
        } else if (nothingSelected) {
            addConnectorButton.isDisable = true
            clearConnectorsButton.isDisable = true
            connectorTypeMenu.isDisable = false
            connectorPositionMenu.isDisable = false
        } else {
            addConnectorButton.isDisable = false
            clearConnectorsButton.isDisable = false
            connectorTypeMenu.isDisable = false
            connectorPositionMenu.isDisable = false
        }
        intersectionStyle.isDisable = treeSkinActive
    }

    /**
     * Flushes the command stack, so that the undo/redo history is cleared.
     */
    private fun flushCommandStack() {
        CommandStack.getCommandStack(graphEditor.model).flush()
    }

    private val selectedConnectorPosition: Side
        /**
         * Gets the side corresponding to the currently selected connector position in the menu.
         *
         * @return the [Side] corresponding to the currently selected connector position
         */
        get() = if (leftConnectorPositionButton.isSelected) {
            Side.LEFT
        } else if (rightConnectorPositionButton.isSelected) {
            Side.RIGHT
        } else if (topConnectorPositionButton.isSelected) {
            Side.TOP
        } else {
            Side.BOTTOM
        }

    companion object {
        private const val STYLE_CLASS_TITLED_SKINS = "titled-skins" //$NON-NLS-1$
    }
}