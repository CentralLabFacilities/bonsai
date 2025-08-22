package de.unibi.citec.clf.bonsai.gui.grapheditor.example

import de.unibi.citec.clf.bonsai.engine.SkillRunner
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.StateID
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.ExitStatus
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.Skill
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.bonsai.State
import javafx.event.EventHandler
import javafx.geometry.Insets
import javafx.scene.Scene
import javafx.scene.control.Button
import javafx.scene.control.Dialog
import javafx.scene.control.Label
import javafx.scene.control.TableColumn
import javafx.scene.layout.VBox
import javafx.scene.control.TableView
import javafx.scene.control.cell.PropertyValueFactory
import javafx.scene.control.cell.TextFieldTableCell
import javafx.scene.layout.GridPane
import javafx.stage.Modality
import javafx.stage.Popup
import javafx.stage.Stage
import javafx.stage.Window
import javafx.util.Callback
import org.apache.log4j.Logger
import org.apache.log4j.PropertyConfigurator
import org.reflections.Reflections
import java.util.Locale.getDefault


open class GraphEditorSkillHandler {

    data class ConfigError(val name: String, val ex: Exception)

    val log: String = GraphEditorSkillHandler::class.java.getResource("/config/logging.properties").path
    val allSkills = mutableListOf<Skill>()

    init {
        PropertyConfigurator.configure(log)
    }

    companion object {
        private val LOGGER = Logger.getLogger(GraphEditorSkillHandler::class.java)
    }

    private fun fetchSkills() {
        val reflections = Reflections("de.unibi.citec.clf.bonsai.skills")
        val allClasses = reflections.getSubTypesOf(AbstractSkill::class.java)
        val errors = mutableListOf<ConfigError>()
        allClasses.forEach {
            //Don't promote usage of deprecated skills...
            if (it.name.contains("deprecated")) return@forEach
            try {
                allSkills.add(fetchSkill(it.name))
            } catch (e: Exception) {
                errors.add(ConfigError(it.name, e))
            }
        }
        LOGGER.info("Configured ${allSkills.size} skills, ${errors.size} failed.")
    }

    private fun fetchSkill(cls: String): Skill {
        val runner = SkillRunner(StateID(cls))
        try {
            runner.tryConfigure()
        } catch (e: NotImplementedError) {
            throw Exception(e)
        }
        //Retrieving skill name from skill class
        val skill = Skill(cls.split(".").last())
        // Slots
        runner.inspectionGetInSlots().forEach {
            skill.readSlots[it.key] = Skill.Slot(it.value, "/")
        }
        runner.inspectionGetOutSlots().forEach {
            skill.writeSlots[it.key] = Skill.Slot(it.value, "/")
        }
        //Vars
        runner.inspectionGetRequiredParams().forEach {
            skill.requiredVars[it.key] = Skill.Variable(it.value, null)
        }
        runner.inspectionGetAllOptionalParams().forEach {
            skill.optionalVars[it.key] = Skill.Variable(it.value, null)
        }
        //ExitStatus
        runner.inspectionGetRequestedTokens().forEach {
            val statusSplit = it.exitStatus.fullStatus.split(".", limit = 2)
            if (statusSplit.size == 2) {
                skill.status.add(
                    ExitStatus(
                        ExitStatus.Status.valueOf(statusSplit[0].uppercase(getDefault())),
                        statusSplit[1]
                    )
                )
            } else {
                skill.status.add(
                    ExitStatus(
                        ExitStatus.Status.valueOf(statusSplit[0].uppercase(getDefault()))
                    )
                )
            }

        }
        return skill
    }


    /**
     *
     */
    fun selectNewSkill(graphEditor: GraphEditor): Skill? {
        fetchSkills()
        val selectedSkill = SelectionDialog(allSkills).display()
        println("Selected skill ${selectedSkill?.name}")
        return selectedSkill
    }

    private data class SelectionDialog(val skills: List<Skill>) {

        var selectedSkill: Skill? = null

        fun display(): Skill? {
            val stage = Stage().apply { initModality(Modality.APPLICATION_MODAL) }

            val tableSkills = TableView<Skill>().apply {
                columns += TableColumn<Skill, String>("Name").apply {
                    cellValueFactory = Callback { it.value.nameProperty() }
                    cellFactory = TextFieldTableCell.forTableColumn()
                }
                items.addAll(skills)
            }

            val label = Label("Select skill")

            val btnSelectCurrentSkill = Button("Confirm selection").apply {
                onAction = EventHandler {event ->
                    selectedSkill = tableSkills.selectionModel.selectedItem
                    stage.close()
                }
            }

            val layout = GridPane().apply {
                padding = Insets(10.0, 10.0, 10.0, 10.0)
                vgap = 5.0
                hgap = 5.0
                add(label, 0, 1)
                add(tableSkills, 0, 2)
                add(btnSelectCurrentSkill, 0, 3)
            }

            val scene = Scene(layout)
            stage.title = "Add new state to graph"
            stage.scene = scene
            stage.showAndWait()

            return selectedSkill
        }
    }
}