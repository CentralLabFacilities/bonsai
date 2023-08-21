package de.unibi.citec.clf.btl.ros2;

import de.unibi.citec.clf.btl.Type;
import id.jrosmessages.Message;
import org.apache.log4j.Logger;
import org.reflections.Reflections;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@SuppressWarnings({"rawtypes", "unchecked"})
public class Ros2SerializerRepository {

    private Ros2SerializerRepository() {
    }


    private static Logger logger = Logger.getLogger(Ros2SerializerRepository.class);

    private static Map<Class<? extends Type>, Map<String, Ros2Serializer<? extends Type, ? extends Message>>> serializers = new HashMap<>();


    static {
        Reflections reflections = new Reflections("de.unibi.citec.clf.btl.ros2.serializers");

        Set<Class<? extends Ros2Serializer>> allClasses = reflections.getSubTypesOf(Ros2Serializer.class);
        for (Class<? extends Ros2Serializer> c : allClasses) {
            try {
                Ros2Serializer s = c.getDeclaredConstructor().newInstance();
                Class<? extends Type> dataType = s.getDataType();
                addSerializer(dataType, s.getMessageType(), s);
            } catch (InstantiationException | SecurityException | ExceptionInInitializerError | IllegalAccessException | NoSuchMethodException | InvocationTargetException e) {
                logger.error("Can not instantiate class " + c.getSimpleName());
                logger.debug("Can not instantiate class " + c.getSimpleName(), e);
            }
        }
    }

    public static <T extends Type, M extends Message, S extends Ros2Serializer<T, M>> void addSerializer(
            Class<T> baseType, Class<M> msgType, S serializer) {
        logger.debug("addSerializer: " + baseType + ", " + msgType + " ," + serializer.getClass());
        if (!serializers.containsKey(baseType)) {
            Map<String, Ros2Serializer<? extends Type, ? extends Message>> submap = new HashMap<>();
            serializers.put(baseType, submap);
        }
        serializers.get(baseType).put(msgType.toString(), serializer);
    }

    public static <T extends Type, M extends Message> Ros2Serializer<T, M> getMsgSerializer(Class<T> baseType, String type) {
        logger.debug("fetch: " + baseType + ", " + type);
        Ros2Serializer<T, M> ret = null;

        Map<String, Ros2Serializer<? extends Type, ? extends Message>> submap = serializers.get(baseType);

        if(submap == null) return null;
        for (Map.Entry<String, Ros2Serializer<? extends Type, ? extends Message>> entry : submap.entrySet()) {
            if (type.equals(entry.getKey())) {
                ret = (Ros2Serializer<T, M>) entry.getValue();
                break;
            }
        }
        //Again
        if(ret == null) for(Map.Entry<String, Ros2Serializer<? extends Type, ? extends Message>> entry : submap.entrySet()){
            String matcher = entry.getKey();
            matcher = matcher.substring(10); //remove "interface "
            matcher = matcher.replaceAll("\\.","/");
            if(type.equals(matcher)) {
                ret = (Ros2Serializer<T, M>) entry.getValue();
                break;
            }
        }

        String print = (ret != null) ? ret.getClass().toString() : "NULL";
        logger.debug("fetched: " + print);
        return ret;
    }

    public static <T extends Type, M extends Message> Ros2Serializer<T, M> getMsgSerializer(Class<T> baseType, Class<M> msgType) {
        logger.debug("fetch: " + baseType + ", " + msgType);
        Ros2Serializer<T, M> ret = (Ros2Serializer<T, M>) serializers.get(baseType).get(msgType.toString());
        String print = (ret != null) ? ret.getClass().toString() : "NULL";
        logger.debug("fetched: " + print);

        if (ret == null) {
            try {
                Object o = msgType.getDeclaredConstructor().newInstance();
                Field f = msgType.getField("_TYPE");
                String t = (String) f.get(o);
                ret = getMsgSerializer(baseType, t);
            } catch (InstantiationException | IllegalAccessException | NoSuchFieldException | SecurityException | NoSuchMethodException | InvocationTargetException ex) {
                logger.error(ex);
            }
        }
        return ret;
    }
}
