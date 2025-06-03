package de.unibi.citec.clf.bonsai.gui.grapheditor.model

import java.beans.IntrospectionException
import java.beans.PropertyDescriptor
import java.beans.SimpleBeanInfo

class GModelBeanInfo: SimpleBeanInfo() {

    companion object {
        private val beanClass: Class<GModel> = GModel::class.java
    }

    override fun getPropertyDescriptors(): Array<PropertyDescriptor>? {
        return try {
            val nodes = PropertyDescriptor("nodes", beanClass, "getNodes", null)
            val connections = PropertyDescriptor("connections", beanClass, "getConnections", null)
            arrayOf(nodes, connections)
        } catch (e: IntrospectionException) {
            e.printStackTrace()
            null
        }
    }
}