package de.unibi.citec.clf.bonsai.gui.grapheditor.api.window

import javafx.animation.Animation
import javafx.animation.KeyFrame
import javafx.animation.Timeline
import javafx.geometry.Point2D
import javafx.scene.Node
import javafx.scene.control.ScrollBar
import javafx.scene.input.MouseEvent
import javafx.util.Duration
import kotlin.math.min
import kotlin.math.round

/**
 * An extension of {@link PanningWindow} that adds an auto-scrolling mechanism.
 *
 * <p>
 * The auto-scrolling occurs when the mouse is dragged to the edge of the window. The scrolling rate increases the
 * longer the cursor is outside the window.
 * </p>
 */
open class AutoScrollingWindow: PanningWindow() {

    companion object {
        private val JUMP_PERIOD: Duration = Duration.millis(25.0)
    }

    private var baseJumpAmount: Double = 1.0
    private var maxJumpAmount: Double = 50.0
    private var jumpAmountIncreasePerStep: Double = 0.5
    private var insetToBeginScroll: Double = 1.0

    private var timeline: Timeline = Timeline()
    private var isScrolling: Boolean = false
    private var jumpDistance: Point2D = Point2D.ZERO

    private var autoScrollingEnabled: Boolean = true
    private var jumpsTaken: Int = 0

    init {
        addEventFilter(MouseEvent.MOUSE_DRAGGED, this::handleMouseDragged)
    }

    override fun handlePanningMouseReleased(event: MouseEvent) {
        super.handlePanningMouseReleased(event)
        endScrolling()
    }

    /**
     * Handles mouse-dragged events.
     *
     * @param event the mouse-dragged event object
     */
    private fun handleMouseDragged(event: MouseEvent) {
        if (event.isPrimaryButtonDown && event.target is Node && !isScrollBar(event)) {
            jumpDistance = getDistanceToJump(event.x, event.y)
            if (jumpDistance == Point2D.ZERO) {
                jumpsTaken = 0
            } else if (!isScrolling && autoScrollingEnabled) {
                startScrolling()
            }
        }
    }

    private fun isScrollBar(event: MouseEvent): Boolean {
        if (event.target is Node) {
            var node: Node? = event.target as Node
            while (node != null) {
                if (node is ScrollBar) {
                    return true
                }
                node = node.parent
            }
        }
        return false
    }

    /**
     * Gets the distance to jump based on the current cursor position.
     *
     * <p>
     * Returns a zero 2D-Point if the cursor is inside the window and no auto-scrolling should occur.
     * </p>
     *
     * @param cursorX the cursor-x position in this {@link PanningWindow}
     * @param cursorY the cursor-y position in this {@link PanningWindow}
     * @return the distance to jump, or zero if no jump should occur
     */
    private fun getDistanceToJump(cursorX: Double, cursorY: Double): Point2D {
        var jumpX = 0.0
        var jumpY = 0.0

        val baseAmount: Double = baseJumpAmount
        val additionalAmount: Double = jumpsTaken * jumpAmountIncreasePerStep
        val distance: Double = min(baseAmount + additionalAmount, maxJumpAmount)

        if (cursorX <= insetToBeginScroll) {
            jumpX = -distance
        } else if (cursorX >= width - insetToBeginScroll) {
            jumpX = distance
        }

        if (cursorY <= insetToBeginScroll) {
            jumpY = -distance
        } else if (cursorY >= height - insetToBeginScroll) {
            jumpY = distance
        }

        if (jumpX.equals(0.0) && jumpY.equals(0.0)) {
            return Point2D.ZERO
        }

        return Point2D(round(jumpX), round(jumpY))
    }

    /**
     * Pans the window by the specified x and y values.
     *
     * <p>
     * The window cannot be panned outside the content. When the window 'hits
     * the edge' of the content it will stop.
     * </p>
     *
     * @param x
     *            the horizontal distance to move the window by
     * @param y
     *            the vertical distance to move the window by
     */
    private fun panBy(x: Double, y: Double) {
        if (x != 0.0 && y != 0.0) {
            panTo(contentX + x, contentY + y)
        } else if (x != 0.0) {
            panToX(contentX + x)
        } else if (y != 0.0) {
            panToY(contentY + y)
        }
    }

    /**
     * Starts the auto-scrolling.
     */
    private fun startScrolling() {
        isScrolling = true
        jumpsTaken = 0
        val frame = KeyFrame(JUMP_PERIOD, {
            if (isScrolling && jumpDistance != Point2D.ZERO) {
                panBy(jumpDistance.x, jumpDistance.y)
                jumpsTaken++
            }
        })
        timeline = Timeline().apply {
            this.cycleCount = Animation.INDEFINITE
            this.keyFrames.add(frame)
            this.play()
        }
    }

    /**
     * Stops the auto-scrolling.
     */
    private fun endScrolling() {
        isScrolling = false
        timeline.stop()
    }

}