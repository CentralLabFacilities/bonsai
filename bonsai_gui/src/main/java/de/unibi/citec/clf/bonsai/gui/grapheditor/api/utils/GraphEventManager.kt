package de.unibi.citec.clf.bonsai.gui.grapheditor.api.utils

import javafx.event.Event

/**
 * <p>
 * Helper class managing the various different gestures in the graph editor to
 * prevent overlapping of different gestures (e.g. a user should not be able to
 * resize and zoom at the same time).
 * </p>
 *
 * <p>
 * For non touch devices this is straightforward by checking if any other
 * gesture is currently active before activating a new one.
 * </p>
 */
interface GraphEventManager {

    /**
     * <p>
     * This method is called by the framework. Custom skins should <b>not</b>
     * call it.
     * </p>
     *
     * @param gesture
     *            {@link GraphInputGesture} to check
     * @param event
     *            {@link Event}
     * @param owner
     *            owner
     * @return {@code true} if the given gesture was activated otherwise
     *         {@code false}
     */
    fun activateGesture(gesture: GraphInputGesture, event: Event, owner: Any): Boolean

    /**
     * <p>
     * This method is called by the framework. Custom skins should <b>not</b>
     * call it.
     * </p>
     *
     * @param expectedGesture
     *            the expected gesture that should be finished
     * @param owner
     *            owner
     * @return {@code true} if the state changed as a result of this operation
     *         or {@code false}
     */
    fun finishGesture(expectedGesture: GraphInputGesture, owner: Any): Boolean
}