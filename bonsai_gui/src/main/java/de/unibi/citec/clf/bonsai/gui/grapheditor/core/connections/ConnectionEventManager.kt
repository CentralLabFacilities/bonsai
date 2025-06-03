package de.unibi.citec.clf.bonsai.gui.grapheditor.core.connections

import de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils.RemoveContext
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnection
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.command.Command

class ConnectionEventManager {

    private var connectionCreatedHandler: ((GConnection) -> Command)? = null
    private var connectionRemovedHandler: ((RemoveContext, GConnection) -> Command)? = null

    /**
     * Sets the handler to be called when connections are created.
     *
     * @param connectionCreatedHandler the handler to be called when connections are created
     */
    fun setOnConnectionCreated(connectionCreatedHandler: (GConnection) -> Command) {
        this.connectionCreatedHandler = connectionCreatedHandler
    }

    /**
     * Sets the handler to be called when connections are removed.
     *
     * @param connectionRemovedHandler the handler to be called when connections are removed
     */
    fun setOnConnectionRemoved(connectionRemovedHandler: (RemoveContext, GConnection) -> Command) {
        this.connectionRemovedHandler = connectionRemovedHandler
    }

    /**
     * Calls the connection-created handler (if it exists) after a connection was created.
     *
     * @param connection the connection that was created
     * @return the compound command that created it
     */
    fun notifyConnectionAdded(connection: GConnection): Command? {
        return connectionCreatedHandler?.invoke(connection)
    }

    /**
     * Calls the connection-removed handler (if it exists) after a connection was removed.
     *
     * @param connection the connection that was removed
     * @return the compound command that removed it
     */
    fun notifyConnectionRemoved(connection: GConnection): Command? {
        val context: RemoveContext = RemoveContext().apply {
            canRemove(connection)
        }
        return connectionRemovedHandler?.invoke(context, connection)
    }

}