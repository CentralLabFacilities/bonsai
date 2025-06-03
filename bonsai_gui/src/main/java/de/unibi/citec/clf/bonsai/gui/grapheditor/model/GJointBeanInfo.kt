package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.beans.IntrospectionException
import java.beans.PropertyDescriptor
import java.beans.SimpleBeanInfo

class GJointBeanInfo : SimpleBeanInfo() {

    companion object {
        private val beanClass = GJoint::class.java
    }

    override fun getPropertyDescriptors(): Array<PropertyDescriptor>? {
        return try {
            val x = PropertyDescriptor("x", beanClass, "getX", "setX")
            val y = PropertyDescriptor("y", beanClass, "getY", "setY")
            val connection = PropertyDescriptor("connection", beanClass, "getConnection", "setConnection")

            arrayOf(x, y, connection)
        } catch (e: IntrospectionException) {
            e.printStackTrace()
            null
        }
    }
}