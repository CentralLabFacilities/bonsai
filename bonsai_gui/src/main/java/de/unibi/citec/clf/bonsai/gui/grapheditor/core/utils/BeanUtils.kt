package de.unibi.citec.clf.bonsai.gui.grapheditor.core.utils

import java.beans.Introspector
import java.beans.PropertyDescriptor

object BeanUtils {

    @Suppress("UNCHECKED_CAST")
    fun <T : Any> copyBean(original: T): T? {
        return try {
            val beanClass = original::class.java
            val beanInfo = Introspector.getBeanInfo(beanClass)
            val newInstance = beanClass.getDeclaredConstructor().newInstance()

            for (pd in beanInfo.propertyDescriptors) {
                val getter = pd.readMethod
                val setter = pd.writeMethod

                if (getter != null && setter != null) {
                    val value = getter.invoke(original)
                    setter.invoke(newInstance, value)
                }
            }

            newInstance as T
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}