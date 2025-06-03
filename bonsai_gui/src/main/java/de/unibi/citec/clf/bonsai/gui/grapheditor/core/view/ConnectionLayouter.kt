package de.unibi.citec.clf.bonsai.gui.grapheditor.core.view

import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel

interface ConnectionLayouter {

    fun initialize(model: GModel)

    fun draw()
}