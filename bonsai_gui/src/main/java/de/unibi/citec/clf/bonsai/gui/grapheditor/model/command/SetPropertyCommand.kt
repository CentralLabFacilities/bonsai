package de.unibi.citec.clf.bonsai.gui.grapheditor.model.command

import javafx.beans.property.Property
import javafx.beans.property.adapter.JavaBeanObjectProperty
import javafx.beans.property.adapter.JavaBeanObjectPropertyBuilder

/**
 * The SetPropertyCommand class represents an executable action to set a given {@link Property}s value.
 */
class SetPropertyCommand<V>(private val property: Property<V>, private val newValue: V) : Command {

    private var oldValue: V? = null
    private var executed = false

    companion object {
        /** Convenience method to create the set property command. */
        fun <S> create(property: Property<S>, newValue: S): SetPropertyCommand<S> {
            return SetPropertyCommand(property, newValue)
        }
    }

    object CommandFactory {
        /**
         * Creates a {@link SetPropertyCommand} for a specified object and attribute.
         * <p>
         * This method uses JavaFX's {@link JavaBeanObjectProperty} to create a {@link Property}
         * that is directly tied to the JavaBean-style property (getter/setter methods) of the object.
         * The returned {@link SetPropertyCommand} can be used to update the property to a new value.
         * </p>
         *
         * @param <T> the type of the object containing the attribute
         * @param <V> the type of the attribute value
         * @param obj the object instance containing the attribute to be updated
         * @param attributeName the name of the attribute (e.g., "Width", "Height")
         * @param newValue the new value to set for the attribute
         * @return a {@link SetPropertyCommand} that can be executed to update the object's attribute to the specified value
         * @throws RuntimeException if there is an issue creating the command, such as if the JavaBean property cannot be accessed
         */
        fun <T, V> create(obj: T, attributeName: String, newValue: V): SetPropertyCommand<V> {
            return try {
                @Suppress("UNCHECKED_CAST")
                val property: JavaBeanObjectProperty<V> = JavaBeanObjectPropertyBuilder.create()
                    .bean(obj)
                    .name(attributeName)
                    .build() as JavaBeanObjectProperty<V>

                SetPropertyCommand(property, newValue)
            } catch (e: NoSuchMethodException) {
                e.printStackTrace()
                throw RuntimeException(
                    "Failed to create SetPropertyCommand: unable to access JavaBean property",
                    e
                )
            }
        }
    }

    override fun execute() {
        if (canExecute()) {
            oldValue = property.value
            property.value = newValue
            executed = true
        }
    }

    override fun undo() {
        if (canUndo()) {
            property.value = oldValue
            executed = false
        }
    }

    override fun canExecute(): Boolean {
        return !executed
    }

    override fun canUndo(): Boolean {
        return executed
    }

    override fun toString(): String {
        return "SetPropertyCommand [property=$property, newValue=$newValue, oldValue=$oldValue, executed=$executed]"
    }
}