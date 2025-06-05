package de.unibi.citec.clf.bonsai.gui.view.utility

import javafx.event.ActionEvent
import javafx.event.EventHandler
import javafx.geometry.Orientation
import javafx.scene.control.*
import javafx.util.Duration
import org.kordamp.ikonli.javafx.FontIcon

class BonsaiUtilityBarCreator {
    private val fileMenu: Menu = Menu("File").apply {
        items.add(MenuItem("Save").apply {
            onAction = EventHandler {
                println("Save to scxml...")
            }
        })
        items.add(SeparatorMenuItem())
        items.add(MenuItem("Load").apply {
            onAction = EventHandler {
                println("Load from  scxml...")
            }
        })
    }
    private val addMenu: Menu = Menu("Add").apply {
        items.add(MenuItem("State").apply {
            onAction = EventHandler {
                println("Adding new node...")
            }
        })
        items.add(SeparatorMenuItem())
        items.add(MenuItem("Sub state machine").apply {
            onAction = EventHandler {
                println("Adding new sub state machine...")
            }
        })
    }
    private val optionsMenu: Menu = Menu("Options").apply {
        onAction = EventHandler {
            println("Options were clicked")
        }
    }
    private val helpMenu: Menu = Menu("Help").apply {
        onAction = EventHandler {
            println("Help was clicked :)")
        }
    }

    fun createBonsaiMenuBar(): MenuBar {
        return MenuBar().apply {
            menus.addAll(fileMenu, addMenu, optionsMenu, helpMenu)
        }
    }

    fun createBonsaiToolBar(): ToolBar {
        return ToolBar().apply {
            items.add(createToolbarButton(
                    iconLiteral = "mdi2c-cursor-default",
                    eventHandler = { println("Single selection") },
                    tooltipText = "Single selection")
            )
            items.add(createToolbarButton(
                    iconLiteral = "mdi2a-arrow-all",
                    eventHandler = { println("Move entities") },
                    tooltipText = "Move entities")
            )
            items.add(createToolbarButton(
                    iconLiteral = "mdi2b-border-none-variant",
                    eventHandler = { println("Multi selection") },
                    tooltipText = "Multi selection")
            )
            items.add(createToolbarButton(
                    iconLiteral = "mdi2i-image-auto-adjust",
                    eventHandler = { println("Auto layout") },
                    tooltipText = "Auto layout")
            )
            orientation = Orientation.VERTICAL
        }
    }

    private fun createToolbarButton(iconLiteral: String,
                                    iconSize: Int = 32,
                                    eventHandler: EventHandler<ActionEvent>,
                                    tooltipText: String): Button {
        return Button().apply {
            graphic = FontIcon().apply {
                this.iconLiteral = iconLiteral
                this.iconSize = iconSize
            }
            onAction = eventHandler
            tooltip = Tooltip(tooltipText).apply {
                this.showDelay = Duration.millis(100.0)
            }
        }
    }
}