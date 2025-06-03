package de.unibi.citec.clf.bonsai.gui.view.utility

import javafx.event.EventHandler
import javafx.geometry.Orientation
import javafx.scene.control.*
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
            items.add(Button().apply {
                graphic = FontIcon().apply {
                    iconLiteral = "mdi2c-cursor-default"
                    iconSize = 32
                }
                onAction = EventHandler {
                    println("Switch to single selection mode")
                }
            })
            items.add(Button().apply {
                graphic = FontIcon().apply {
                    iconLiteral = "mdi2a-arrow-all"
                    iconSize = 32
                }
                onAction = EventHandler {
                    println("Switch to move mode")
                }
            })
            items.add(Button().apply {
                graphic = FontIcon().apply {
                    iconLiteral = "mdi2b-border-none-variant"
                    iconSize = 32
                }
                onAction = EventHandler {
                    println("Switch to multi selection mode")
                }
            })
            items.add(Button().apply {
                graphic = FontIcon().apply {
                    iconLiteral = "mdi2i-image-auto-adjust"
                    iconSize = 32
                }
                onAction = EventHandler {
                    println("Auto layout")
                }
            })
            orientation = Orientation.VERTICAL
        }
    }
}