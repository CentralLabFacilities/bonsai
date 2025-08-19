package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.clear
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.redo
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.Commands.undo
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.EditorElement
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.DefaultGraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.SimpleConnectionSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.view.GraphEditorContainer
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.titled.TitledSkinConstants
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.TreeConnectorValidator
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.tree.TreeSkinConstants
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.selections.SelectionCopier
import de.unibi.citec.clf.bonsai.gui.grapheditor.example.utils.AwesomeIcon
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.CommandStack
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
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
    private lateinit var showGridButton: RadioMenuItem

    @FXML
    private lateinit var snapToGridButton: RadioMenuItem

    @FXML
    private lateinit var readOnlyMenu: Menu

    @FXML
    private lateinit var titledSkinButton: RadioMenuItem

    @FXML
    private lateinit var bonsaiSkinButton: RadioMenuItem

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
    private val graphEditorSkillHandler = GraphEditorSkillHandler()
    private var titledSkinController: TitledSkinController? = null
    private var bonsaiSkinController: BonsaiSkinController? = null
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
        addExampleSkills()
        graphEditorContainer.graphEditor = graphEditor
        setDetouredStyle()
        graphEditorContainer.let {
            titledSkinController = TitledSkinController(graphEditor, it)
            bonsaiSkinController = BonsaiSkinController(graphEditor, it)
        }

        activeSkinController.set(bonsaiSkinController)
        graphEditor.modelProperty().addListener { _, _, n: GModel -> selectionCopier.initialize(n) }
        selectionCopier.initialize(model)
        initializeMenuBar()
        addActiveSkinControllerListener()
    }

    private fun addExampleSkills() {
        val saySkill = Skill("dialog.Talk").apply {
            requiredVars["#_MESSAGE"] = "Hello, i am tiago"
            optionalVars["#_BLOCKING"] = "true"
            addTransition("success")
            addTransition("fatal")
        }
        graphEditor.model.availableSkills.addAll(saySkill)
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
        activeSkinController.get()?.addNode(graphEditor.view.localToSceneTransform.mxx, State().apply {
            skill = graphEditor.model.availableSkills[0]
        })
    }

    @FXML
    fun addSimpleState() {
        activeSkinController.get()?.addNode(graphEditor.view.localToSceneTransform.mxx, State().apply {
            skill = graphEditor.model.availableSkills[0]
        })
        //graphEditorSkillHandler.showSelectionPopUp(graphEditor.view.scene.window)
    }

    @FXML
    fun addCustomState() {

    }

    @FXML
    fun setTitledSkin() {
        activeSkinController.set(titledSkinController)
    }

    @FXML
    fun setBonsaiSkin() {
        activeSkinController.set(bonsaiSkinController)
    }

    @FXML
    fun setGappedStyle() {
        graphEditor.editorProperties.customProperties.remove(SimpleConnectionSkin.SHOW_DETOURS_KEY)
        graphEditor.reload()
    }

    @FXML
    fun setDetouredStyle() {
        val customProperties: MutableMap<String, String> = graphEditor.editorProperties.customProperties
        customProperties[SimpleConnectionSkin.SHOW_DETOURS_KEY] = true.toString()
        graphEditor.reload()
    }

    @FXML
    fun toggleMinimap() {
        minimapButton.let { graphEditorContainer.minimap.visibleProperty()?.bind(it.selectedProperty()) }
    }

    /**
     * Initializes the menu bar.
     */
    private fun initializeMenuBar() {

        val skinGroup = ToggleGroup()
        skinGroup.toggles.addAll(titledSkinButton, bonsaiSkinButton)

        val connectionStyleGroup = ToggleGroup()
        connectionStyleGroup.toggles.addAll(gappedStyleButton, detouredStyleButton)

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
        if (titledSkinController?.equals(activeSkinController.get()) == true) {
            graphEditor.connectorValidator = null
            if (!graphEditor.view.styleClass.contains(STYLE_CLASS_TITLED_SKINS)) {
                graphEditor.view.styleClass.add(STYLE_CLASS_TITLED_SKINS)
            }
            titledSkinButton.isSelected = true
        } else if (bonsaiSkinController?.equals(activeSkinController.get()) == true) {
            graphEditor.connectorValidator = null
            if (!graphEditor.view.styleClass.contains(STYLE_CLASS_TITLED_SKINS)) {
                graphEditor.view.styleClass.add(STYLE_CLASS_TITLED_SKINS)
            }
            bonsaiSkinButton.isSelected = true
        } else {
            graphEditor.connectorValidator = null
            graphEditor.view.styleClass.remove(STYLE_CLASS_TITLED_SKINS)
            bonsaiSkinButton.isSelected = true
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
        activeSkinController.set(bonsaiSkinController)
    }

    /**
     * Checks if the connector buttons need disabling (e.g. because no nodes are selected).
     */
    private fun checkConnectorButtonsToDisable() {
        val nothingSelected = graphEditor.selectionManager.selectedItems.stream()
                .noneMatch { e: Selectable? -> e is GNode }
        val titledSkinActive: Boolean = titledSkinController?.equals(activeSkinController.get()) ?: false
        intersectionStyle.isDisable = false
    }

    /**
     * Flushes the command stack, so that the undo/redo history is cleared.
     */
    private fun flushCommandStack() {
        CommandStack.getCommandStack(graphEditor.model).flush()
    }

    companion object {
        private const val STYLE_CLASS_TITLED_SKINS = "titled-skins" //$NON-NLS-1$
    }
}