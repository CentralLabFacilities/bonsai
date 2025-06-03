package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.engine.SCXMLDecoder
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import org.apache.commons.scxml.model.SCXML
import javafx.stage.FileChooser
import javafx.stage.Window
import org.xml.sax.InputSource
import java.io.File
import java.io.StringReader

/**
 * Helper class for crudely loading [GModel] states to and from XML.
 *
 *
 *
 * Not part of the graph editor library, only used in the [GraphEditorDemo] application.
 *
 */
class GraphEditorPersistence {
    private val initialDirectory: File? = null

    /**
     * Saves the graph editor's [GModel] state to an XML file via the [FileChooser].
     *
     * @param graphEditor the graph editor whose model state is to be saved
     */
    fun saveToFile(graphEditor: GraphEditor?) {
//
//        final Scene scene = graphEditor.getView().getScene();
//
//        if (scene != null) {
//
//            final File file = showFileChooser(scene.getWindow(), true);
//
//            if (file != null && graphEditor.getModel() != null) {
//                saveModel(file, graphEditor.getModel());
//            }
//        }
    }

    /**
     * Loads an XML .graph file into the given graph editor.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadFromFile(graphEditor: GraphEditor) {
        val scene = graphEditor.view.scene
        val file: File? = showFileChooser(scene.window, false)
        file?.let { loadModel(file, graphEditor) }
    }

    /**
     * Loads the sample saved in the **sample.graph** file.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadSample(graphEditor: GraphEditor) {
        loadSample(SAMPLE_FILE, graphEditor)
    }

    /**
     * Loads the large sample saved in the **sample-large.graph** file.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadSampleLarge(graphEditor: GraphEditor) {
        loadSample(SAMPLE_FILE_LARGE, graphEditor)
    }

    /**
     * Loads the sample saved in the **tree.graph** file.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadTree(graphEditor: GraphEditor) {
        loadSample(TREE_FILE, graphEditor)
    }

    /**
     * Loads the sample saved in the **titled.graph** file.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    fun loadTitled(graphEditor: GraphEditor) {
        loadSample(TITLED_FILE, graphEditor)
    }

    /**
     * Loads the sample saved in the given file.
     *
     * @param graphEditor the graph editor in which the loaded model will be set
     */
    private fun loadSample(file: String, graphEditor: GraphEditor) {


        //val samplePath = javaClass.getResource(file)?.toExternalForm()

        //val resourceFactory = XMIReso

//        final String samplePath = getClass().getResource(file).toExternalForm();
//
//        final URI fileUri = URI.createURI(samplePath);
//        final XMIResourceFactoryImpl resourceFactory = new XMIResourceFactoryImpl();
//        final Resource resource = resourceFactory.createResource(fileUri);
//
//        try {
//            resource.load(Collections.EMPTY_MAP);
//        } catch (final IOException e) {
//            e.printStackTrace();
//        }
//
//        if (!resource.getContents().isEmpty() && resource.getContents().get(0) instanceof GModel model) {
//            graphEditor.setModel(model);
//        }
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
    private fun showFileChooser(window: Window, save: Boolean): File {
        val fileChooser = FileChooser()
        val filter = FileChooser.ExtensionFilter(CHOOSER_TEXT, "*" + FILE_EXTENSION) //$NON-NLS-1$
        fileChooser.extensionFilters.add(filter)
        if (initialDirectory != null && initialDirectory.exists()) {
            fileChooser.initialDirectory = initialDirectory
        }
        return if (save) {
            fileChooser.showSaveDialog(window)
        } else fileChooser.showOpenDialog(window)
        // ELSE:
    }

    /**
     * Saves the graph editor's model state in the given file.
     *
     * @param file the [File] the model state will be saved in
     * @param model the [GModel] to be saved
     */
    private fun saveModel(file: File, model: GModel) {

//        String absolutePath = file.getAbsolutePath();
//        if (!absolutePath.endsWith(FILE_EXTENSION)) {
//            absolutePath += FILE_EXTENSION;
//        }
//
//        final EditingDomain editingDomain = AdapterFactoryEditingDomain.getEditingDomainFor(model);
//
//        final URI fileUri = URI.createFileURI(absolutePath);
//        final XMIResourceFactoryImpl resourceFactory = new XMIResourceFactoryImpl();
//        final Resource resource = resourceFactory.createResource(fileUri);
//        resource.getContents().add(model);
//
//        try {
//            resource.save(Collections.EMPTY_MAP);
//        } catch (final IOException e) {
//            e.printStackTrace();
//        }
//
//        editingDomain.getResourceSet().getResources().clear();
//        editingDomain.getResourceSet().getResources().add(resource);
//
//        initialDirectory = file.getParentFile();
    }

    /**
     * Loads the model from the given file and sets it in the given graph editor.
     *
     * @param file the [File] to be loaded
     * @param graphEditor the [GraphEditor] in which the loaded model will be set
     */
    private fun loadModel(file: File, graphEditor: GraphEditor) {

        println("$file")

        val defaultMappings = mutableMapOf("SCXML" to "${System.getProperty("user.dir")}/src/main/config/state_machines")

        val scxml = SCXMLDecoder.parseSCXML(file, defaultMappings)

        //println(scxml.children)
        println(scxml.targets)

        val model = GModel()





//        final URI fileUri = URI.createFileURI(file.getAbsolutePath());
//
//        final XMIResourceFactoryImpl resourceFactory = new XMIResourceFactoryImpl();
//        final Resource resource = resourceFactory.createResource(fileUri);
//
//        try {
//            resource.load(Collections.EMPTY_MAP);
//        } catch (final IOException e) {
//            e.printStackTrace();
//        }
//
//        if (!resource.getContents().isEmpty() && resource.getContents().get(0) instanceof GModel model) {
//            graphEditor.setModel(model);
//        }
//
//        initialDirectory = file.getParentFile();
    }

    companion object {
        private const val FILE_EXTENSION = ".xml" //$NON-NLS-1$
        private const val CHOOSER_TEXT = "SCXML (*" + FILE_EXTENSION + ")" //$NON-NLS-1$ //$NON-NLS-2$
        private const val SAMPLE_FILE = "/sample" + FILE_EXTENSION //$NON-NLS-1$
        private const val SAMPLE_FILE_LARGE = "/sample-large" + FILE_EXTENSION //$NON-NLS-1$
        private const val TREE_FILE = "/tree" + FILE_EXTENSION //$NON-NLS-1$
        private const val TITLED_FILE = "/titled" + FILE_EXTENSION //$NON-NLS-1$
    }
}