package de.unibi.citec.clf.bonsai.gui.grapheditor.example.customskins.bonsai.utils

import de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters.SlotAdapter
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.adapters.VariableAdapter
import javafx.beans.binding.DoubleBinding
import javafx.beans.property.BooleanProperty
import javafx.beans.property.StringProperty
import javafx.geometry.Pos
import javafx.scene.control.*
import javafx.scene.control.cell.TextFieldTableCell
import javafx.scene.control.skin.TableViewSkin
import javafx.util.Callback
import org.kordamp.ikonli.javafx.FontIcon

/**
 * Helper class to generate TableViews for Skills parameters (e.g. slots, vars, ...)
 */
object SkillParamsTableGenerator {

    /**
     * Generates TableView to present slots.
     * @param slotsAdapted List of slots adapted for TableView
     */
    fun generateSlotTable(slotsAdapted: List<SlotAdapter>): TableView<SlotAdapter> {
        return TableView<SlotAdapter>().apply {
            columns += createTextColumn<SlotAdapter>("Name") { it.nameProperty() }
            columns += createTextColumn<SlotAdapter>("DataType") { it.dataTypeProperty() }
            columns += createTextFieldColumn("xPath", this) { it.xpathProperty() }
            columns += createBooleanCheckmarkColumn("Read", this) { it.readProperty() }
            columns += createBooleanCheckmarkColumn("Write", this) { it.writeProperty() }
            items.addAll(slotsAdapted)
            shrinkToContent()
        }
    }

    /**
     * Generated TableView to present vars.
     * @param varsAdapted List of vars adapted for TableView
     */
    fun generateVarsTable(varsAdapted: List<VariableAdapter>): TableView<VariableAdapter> {
        return TableView<VariableAdapter>().apply {
            columns += createTextColumn<VariableAdapter>("Name") {it.nameProperty()}
            columns += createTextColumn<VariableAdapter>("DataType") {it.dataTypeProperty()}
            columns += createTextFieldColumn("Expression", this) {it.expressionProperty()}
            items.addAll(varsAdapted)
            shrinkToContent()
        }
    }

    private fun <T> createTextColumn(title: String, propertyProvider: (T) -> StringProperty): TableColumn<T, String> {
        return TableColumn<T, String>(title).apply {
            cellValueFactory = Callback { propertyProvider(it.value) }
            cellFactory = TextFieldTableCell.forTableColumn()
        }
    }

    private fun <T> createTextFieldColumn(
        title: String,
        table: TableView<T>,
        propertyProvider: (T) -> StringProperty
    ): TableColumn<T, String> {
        return TableColumn<T, String>(title).apply {
            cellValueFactory = Callback { propertyProvider(it.value) }
            cellFactory = Callback {
                object : TableCell<T, String>() {
                    private val textField = TextField()

                    init {
                        textField.textProperty().addListener { _, _, newValue ->
                            if (index >= 0 && index < table.items.size) {
                                propertyProvider(table.items[index]).set(newValue)
                            }
                        }
                    }

                    override fun updateItem(item: String?, empty: Boolean) {
                        super.updateItem(item, empty)
                        if (empty || item == null) graphic = null
                        else if (textField.text != item) textField.text = item
                        graphic = textField
                    }
                }
            }
        }
    }

    private fun <T> createBooleanCheckmarkColumn(
        title: String,
        table: TableView<T>,
        propertyProvider: (T) -> BooleanProperty
    ): TableColumn<T, Boolean> {
        return TableColumn<T, Boolean>(title).apply {
            cellValueFactory = Callback { propertyProvider(it.value) }
            cellFactory = Callback {
                object : TableCell<T, Boolean>() {
                    init {
                        if (index >= 0 && index < table.items.size) {
                            if (propertyProvider(table.items[index]).get()) {
                                println("Adding checkmark...")
                                graphic = FontIcon("mdal-check_box")
                                contentDisplay = ContentDisplay.GRAPHIC_ONLY
                                alignment = Pos.CENTER
                            }
                        }
                    }

                    override fun updateItem(checked: Boolean?, empty: Boolean) {
                        super.updateItem(checked, empty)
                        if (empty || checked == null) graphic == null
                        else if (checked) {
                            println("Adding checkmark...")
                            graphic = FontIcon("mdal-check_box")
                            contentDisplay = ContentDisplay.GRAPHIC_ONLY
                            alignment = Pos.CENTER
                        }
                    }
                }
            }
        }
    }

    private fun TableView<*>.shrinkToContent(rowHeight: Double = 30.0, headerHeight: Double = 25.0) {
        if (this.skin == null) this.skin = TableViewSkin(this)
        val heightBinding: DoubleBinding = object : DoubleBinding() {
            init {
                super.bind(this@shrinkToContent.items)
            }

            override fun computeValue(): Double {
                val headerHeight = this@shrinkToContent.lookup(".column-header-background")
                    ?.boundsInParent?.height ?: headerHeight
                val rowHeight = this@shrinkToContent.lookup(".table-row-cell")?.boundsInParent?.height ?: rowHeight
                val rowsHeight = rowHeight * this@shrinkToContent.items.size
                val hasVerticalScrollbar = this@shrinkToContent.lookup(".scroll-bar:horizontal")?.isVisible ?: false
                return if (hasVerticalScrollbar) {
                    rowsHeight + headerHeight + 12
                } else rowsHeight + headerHeight + 2
            }
        }
        this.prefHeightProperty().bind(heightBinding)
    }
}