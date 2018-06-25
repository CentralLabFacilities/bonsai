package de.unibi.citec.clf.btl.ros;

import de.unibi.citec.clf.btl.Type;
import org.apache.log4j.Logger;
import org.reflections.Reflections;
import org.ros.internal.message.Message;

import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@SuppressWarnings({"rawtypes", "unchecked"})
public class RosSerializerRepository {

    private RosSerializerRepository() {
    }


    private static Logger logger = Logger.getLogger(RosSerializerRepository.class);

    private static Map<Class<? extends Type>, Map<String, RosSerializer<? extends Type, ? extends Message>>> serializers = new HashMap<>();


    static {
        Reflections reflections = new Reflections("de.unibi.citec.clf.btl.ros.serializers");

        Set<Class<? extends RosSerializer>> allClasses = reflections.getSubTypesOf(RosSerializer.class);
        for (Class<? extends RosSerializer> c : allClasses) {
            try {
                RosSerializer s = c.newInstance();
                Class<? extends Type> dataType = s.getDataType();
                addSerializer(dataType, s.getMessageType(), s);
            } catch (InstantiationException | SecurityException | ExceptionInInitializerError | IllegalAccessException e) {
                logger.error("Can not instantiate class " + c.getSimpleName());
                logger.debug("Can not instantiate class " + c.getSimpleName(), e);
            }
        }
    }

    public static <T extends Type, M extends Message, S extends RosSerializer<T, M>> void addSerializer(
            Class<T> baseType, Class<M> msgType, S serializer) {
        logger.debug("addSerializer: " + baseType + ", " + msgType + " ," + serializer.getClass());
        if (!serializers.containsKey(baseType)) {
            Map<String, RosSerializer<? extends Type, ? extends Message>> submap = new HashMap<>();
            serializers.put(baseType, submap);
        }
        serializers.get(baseType).put(msgType.toString(), serializer);
    }

    public static <T extends Type, M extends Message> RosSerializer<T, M> getMsgSerializer(Class<T> baseType, String type) {
        logger.debug("fetch: " + baseType + ", " + type);
        RosSerializer<T, M> ret = null;

        Map<String, RosSerializer<? extends Type, ? extends Message>> submap = serializers.get(baseType);
        for (Map.Entry<String, RosSerializer<? extends Type, ? extends Message>> entry : submap.entrySet()) {
            ret = (RosSerializer<T, M>) entry.getValue();
            if (type.equals(entry.getKey())) {
                break;
            }

        }
        String print = (ret != null) ? ret.getClass().toString() : "NULL";
        logger.debug("fetched: " + print);
        return ret;
    }

    public static <T extends Type, M extends Message> RosSerializer<T, M> getMsgSerializer(Class<T> baseType, Class<M> msgType) {
        RosSerializer<T, M> ret = (RosSerializer<T, M>) serializers.get(baseType).get(msgType.toString());
        logger.debug("fetch: " + baseType + ", " + msgType);
        String print = (ret != null) ? ret.getClass().toString() : "NULL";
        logger.debug("fetched: " + print);

        if (ret == null) {
            try {
                Object o = msgType.newInstance();
                Field f = msgType.getField("_TYPE");
                String t = (String) f.get(o);
                ret = getMsgSerializer(baseType, t);
            } catch (InstantiationException | IllegalAccessException | NoSuchFieldException | SecurityException ex) {
                logger.error(ex);
            }
        }
        return ret;
    }
}
