package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.beans.IntrospectionException
import java.beans.PropertyDescriptor
import java.beans.SimpleBeanInfo

class GNodeBeanInfo : SimpleBeanInfo() {

    companion object {
        private val beanClass: Class<GNode> = GNode::class.java
    }

    override fun getPropertyDescriptors(): Array<PropertyDescriptor>? {
        return try {
            val x = PropertyDescriptor("x", beanClass, "getX", "setX")
            val y = PropertyDescriptor("y", beanClass, "getY", "setY")
            val width = PropertyDescriptor("width", beanClass, "getWidth", "setWidth")
            val height = PropertyDescriptor("height", beanClass, "getHeight", "setHeight")
            val type = PropertyDescriptor("type", beanClass, "getType", "setType")
            val connectors = PropertyDescriptor("connectors", beanClass, "getConnectors", null)

            arrayOf(x, y, width, height, type, connectors)
        } catch (e: IntrospectionException) {
            e.printStackTrace()
            null
        }
    }

}