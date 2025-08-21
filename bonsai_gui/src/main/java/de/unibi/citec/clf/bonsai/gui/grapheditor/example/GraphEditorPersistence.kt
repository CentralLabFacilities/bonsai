package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import javafx.stage.FileChooser
import javafx.stage.Window
import java.io.File

/**
 * Helper class for loading and saving state machines from and to files.
 */
class GraphEditorPersistence {
    private var initialDirectory: File? = null

    /**
     * Saves the graph editor's [GModel] state to an XML file via the [FileChooser].
     *
     * @param graphEditor the graph editor whose model state is to be saved
     */
    fun saveToFile(graphEditor: GraphEditor?) {
        //TODO("Not yet implemented!")
    }

    /**
     * Loads an XML .graph file into the given graph editor.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadFromFile(graphEditor: GraphEditor) {
        val scene = graphEditor.view.scene
        val file: File? = showFileChooser(scene.window, false)
        file?.let { loadStateMachineFromFile(file, graphEditor) }
    }

    /**
     * Opens the file chooser and returns the selected [File].
     *
     * @param window
     * @param save
     * `true` to open a save dialog, `false` to open a
     * load dialog
     * @return the chosen file
     */
    private fun showFileChooser(window: Window, save: Boolean): File? {
        val fileChooser = FileChooser()
        val filter = FileChooser.ExtensionFilter(CHOOSER_TEXT, "*$FILE_EXTENSION") //$NON-NLS-1$
        fileChooser.extensionFilters.add(filter)
        initialDirectory?.let {
            if (it.exists()) fileChooser.initialDirectory = it
        }
        return if (save) {
            fileChooser.showSaveDialog(window)
        } else fileChooser.showOpenDialog(window)
    }

    /**
     * Loads state machine from .xml file.
     *
     * @param file The file to read from
     * @param graphEditor The grapheditor instance that should hold the new graph model
     */
    private fun loadStateMachineFromFile(file: File, graphEditor: GraphEditor) {
        val rootState = State("root")
        val listOfAllStates = listOf<State>()
        //TODO("Add parsing of xml-Statemachine")
        listOfAllStates.forEach { state -> rootState.addSubState(state) }
        val model = GModel().apply {
            addNewRootState(rootState)
        }
        graphEditor.model = model
        initialDirectory = file.parentFile;
    }



    companion object {
        private const val CHOOSER_TEXT = "Select statemachine to load"
        private const val FILE_EXTENSION = ".xml"
    }
}