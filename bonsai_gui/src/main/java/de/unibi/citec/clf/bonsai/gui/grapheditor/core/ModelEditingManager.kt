package de.unibi.citec.clf.bonsai.gui.grapheditor.core

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.SkinLookup
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.RemoveContext
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GNode
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.Selectable
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command
import java.util.function.BiFunction

interface ModelEditingManager {

    fun initialize(model: GModel)

    fun setOnConnectionRemoved(onConnectionRemoved: BiFunction<RemoveContext, GConnection, Command>)

    fun setOnNodeRemoved(onNodeRemoved: BiFunction<RemoveContext, GNode, Command>)

    fun updateLayoutValues(skinLookup: SkinLookup)

    fun remove(toRemove: Collection<Selectable>)

}