package de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GJointSkin
import de.unibi.citec.clf.bonsai.gui.grapheditor.api.GraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections.RectangularConnections
import de.unibi.citec.clf.bonsai.gui.grapheditor.core.skins.defaults.connection.*
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import org.apache.log4j.Logger

class DefaultConnectionSkin(connection: GConnection) : SimpleConnectionSkin(connection) {

    companion object {
        private val LOGGER = Logger.getLogger(DefaultConnectionSkin::class.java)
    }

    private val jointCreator: JointCreator
    private val jointCleaner: JointCleaner
    private val jointAlignmentManager: JointAlignmentManager
    private val cursorOffsetCalculator: CursorOffsetCalculator

    override var graphEditor: GraphEditor? = null
        set(value) {
            field = value
            jointCreator.graphEditor = graphEditor
            jointCleaner.graphEditor = graphEditor
            jointAlignmentManager.skinLookup = graphEditor?.skinLookup
        }

    init {
        performChecks()
        cursorOffsetCalculator = CursorOffsetCalculator(connection, path, backgroundPath, connectionSegments)
        jointCreator = JointCreator(connection, cursorOffsetCalculator)
        jointCleaner = JointCleaner(connection)
        jointAlignmentManager = JointAlignmentManager(connection)

        jointCreator.addJointCreationHandler(root)
    }

    override fun setJointSkins(jointSkins: List<GJointSkin>) {
        super.setJointSkins(jointSkins)
        jointCleaner.addCleaningHandlers(jointSkins)
        jointAlignmentManager.addAlignmentHandlers(jointSkins)
    }

    private fun performChecks() {
        item?.let {
            if (!RectangularConnections.checkJointCount(it)) {
                LOGGER.error("Joint count not compatible with source and target connector types")
            }
        }
    }
}