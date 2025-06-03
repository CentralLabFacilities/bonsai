package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.beans.IntrospectionException
import java.beans.PropertyDescriptor
import java.beans.SimpleBeanInfo

class GConnectorBeanInfo : SimpleBeanInfo() {

    companion object {
        private val beanClass = GConnector::class.java
    }

    override fun getPropertyDescriptors(): Array<PropertyDescriptor>? {
        return try {
            val id = PropertyDescriptor("id", beanClass, "getId", "setId")
            val type = PropertyDescriptor("type", beanClass, "getType", "setType")
            val parent = PropertyDescriptor("parent", beanClass, "getParent", "setParent")
            val connections = PropertyDescriptor("connections", beanClass, "getConnections", null)
            val x = PropertyDescriptor("x", beanClass, "getX", "setX")
            val y = PropertyDescriptor("y", beanClass, "getY", "setY")
            val connectionDetachedOnDrag = PropertyDescriptor(
                "connectionDetachedOnDrag", beanClass, "isConnectionDetachedOnDrag", "setConnectionDetachedOnDrag"
            )

            arrayOf(id, type, parent, connections, x, y, connectionDetachedOnDrag)
        } catch (e: IntrospectionException) {
            e.printStackTrace()
            null
        }
    }
}