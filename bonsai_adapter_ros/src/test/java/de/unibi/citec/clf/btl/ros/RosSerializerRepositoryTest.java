package de.unibi.citec.clf.btl.ros;

import de.unibi.citec.clf.btl.Type;
import junit.framework.TestCase;
import junit.framework.TestResult;
import org.reflections.Reflections;
import org.ros.internal.message.Message;

import java.lang.reflect.InvocationTargetException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.junit.Test;

public class RosSerializerRepositoryTest {

    @Test
    public void testDublicates() throws Exception {
        Reflections reflections = new Reflections("de.unibi.citec.clf.btl.ros.serializers");
        Map<Class<? extends Type>, Map<String, RosSerializer<? extends Type, ? extends Message>>> serializers = new HashMap<>();

        Set<Class<? extends RosSerializer>> allClasses = reflections.getSubTypesOf(RosSerializer.class);
        for (Class<? extends RosSerializer> c : allClasses) {

            RosSerializer s = c.getDeclaredConstructor().newInstance();
            Class<? extends Type> dataType = s.getDataType();
            if (!serializers.containsKey(dataType)) {
                Map<String, RosSerializer<? extends Type, ? extends Message>> submap = new HashMap<>();
                serializers.put(dataType, submap);
            }
            if (serializers.get(dataType).containsKey(s.getMessageType().toString())) {
                throw new Exception("duplicate serializer for " + dataType + "->" + s.getMessageType());
            }
            serializers.get(dataType).put(s.getMessageType().toString(), s);
        }
    }



}