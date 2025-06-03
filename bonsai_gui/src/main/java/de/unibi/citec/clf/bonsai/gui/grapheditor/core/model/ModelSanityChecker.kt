package de.unibi.citec.clf.bonsai.gui.grapheditor.core.model

import de.unibi.citec.clf.bonsai.gui.grapheditor.core.DefaultGraphEditor
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GConnector
import de.unibi.citec.clf.bonsai.gui.grapheditor.model.GModel
import org.apache.log4j.Logger

/**
 * Provides a static validation method to check a {@link GModel} instance for
 * errors.
 */
object ModelSanityChecker {

    private val LOGGER = Logger.getLogger(DefaultGraphEditor::class.java)
    private const val NEGATIVE_WIDTH_OR_HEIGHT_ERROR_MSG = "Model contains negative width / height values."
    private const val MISSING_REFERENCE_ERROR_MSG = "A connector is missing a reference to its connection"
    private const val CONNECTION_SOURCE_OR_TARGET_IS_NULL_ERROR_MSG = "Connection must have non-null source and target connectors."

    /**
     * Validates the given {@link GModel}.
     *
     * @param model
     *            the {@link GModel} to be validated
     * @return {@code true} if the model is valid
     */
    fun validate(model: GModel): Boolean {
        return validateSizes(model) && validateReferences(model)
    }

    /**
     * Performs a basic sanity check that width and height parameters are
     * non-negative.
     *
     * @param model
     *            the {@link GModel} to be validated
     * @return {@code true} if the model width and height parameters are valid
     */
    fun validateSizes(model: GModel): Boolean {
        if (model.contentWidth < 0 || model.contentHeight < 0) {
            LOGGER.error(NEGATIVE_WIDTH_OR_HEIGHT_ERROR_MSG)
            return false
        }
        for (node in model.nodes) {
            if (node.width < 0 || node.height < 0) {
                LOGGER.error(NEGATIVE_WIDTH_OR_HEIGHT_ERROR_MSG)
                return false
            }
        }
        return true
    }

    /**
     * Validates that the references between connectors and their connections
     * make sense.
     *
     * @param model
     *            the {@link GModel} to be validated
     * @return {@code true} if the model references are valid
     */
    fun validateReferences(model: GModel): Boolean {
        var valid = true

        for (connection in model.connections) {
            val source: GConnector? = connection?.source
            val target: GConnector? = connection?.target
            if (source == null || target == null) {
                LOGGER.error(CONNECTION_SOURCE_OR_TARGET_IS_NULL_ERROR_MSG)
                valid = false
            } else if (!source.connections.contains(connection)) {
                LOGGER.error(MISSING_REFERENCE_ERROR_MSG)
                valid = false
            } else if (!target.connections.contains(connection)) {
                LOGGER.error(MISSING_REFERENCE_ERROR_MSG)
            }
        }
        return valid
    }

}