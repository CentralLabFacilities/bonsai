package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.beans.IntrospectionException
import java.beans.PropertyDescriptor
import java.beans.SimpleBeanInfo

class GConnectionBeanInfo : SimpleBeanInfo() {

    companion object {
        private val beanClass = GConnection::class.java
    }

    override fun getPropertyDescriptors(): Array<PropertyDescriptor>? {
        return try {
            val id = PropertyDescriptor("id", beanClass, "getId", "setId")
            val type = PropertyDescriptor("type", beanClass, "getType", "setType")
            val source = PropertyDescriptor("source", beanClass, "getSource", "setSource")
            val target = PropertyDescriptor("target", beanClass, "getTarget", "setTarget")
            val bidirectional = PropertyDescriptor("bidirectional", beanClass, "isBidirectional", "setBidirectional")
            val joints = PropertyDescriptor("joints", beanClass, "getJoints", null)

            arrayOf(id, type, source, target, bidirectional, joints)
        } catch (e: IntrospectionException) {
            e.printStackTrace()
            null
        }
    }
}