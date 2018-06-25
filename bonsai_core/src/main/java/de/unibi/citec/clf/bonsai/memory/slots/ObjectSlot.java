package de.unibi.citec.clf.bonsai.memory.slots;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.btl.Type;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.util.logging.Level;

import org.apache.log4j.Logger;

/**
 *
 * @author lruegeme
 * @param <T>
 */
public class ObjectSlot<T extends Object> implements MemorySlot<T> {

    T savedObject;
    private Class<T> dataType;

    private final Logger logger = Logger.getLogger(getClass());

    public ObjectSlot(Class<T> type) {
        dataType = type;
    }

    @Override
    public <S extends T> void memorize(S object) throws CommunicationException {
        logger.debug("memorized " + object.toString());
        savedObject = object;
    }

    @Override
    public void forget() throws CommunicationException {
        savedObject = null;
    }

    @Override
    public <S extends T> T recall() throws CommunicationException {

        if (savedObject == null) {
            return null;
        }

        //try different copy methods
        
        Class<T> clazz = (Class<T>) savedObject.getClass();
        try {
            Constructor<?> copyConstructor = clazz.getConstructor(clazz);
            T copy = (T) copyConstructor.newInstance(savedObject);
            return copy;
        } catch (IllegalAccessException | IllegalArgumentException | InstantiationException | NoSuchMethodException
                | SecurityException | InvocationTargetException ex) {
            logger.trace(ex);
        }

        
        if (savedObject instanceof Serializable) {

            ObjectOutputStream oos = null;
            ObjectInputStream ois = null;
            try {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                oos = new ObjectOutputStream(bos);
                oos.writeObject(savedObject);
                oos.flush();
                ByteArrayInputStream bin = new ByteArrayInputStream(bos.toByteArray());
                ois = new ObjectInputStream(bin);
                return (T) ois.readObject(); // G
            } catch (IOException | ClassNotFoundException ex) {
                logger.trace(ex);
            } finally {
                try {
                    if (oos != null) {
                        oos.close();
                    }
                    if (ois != null) {
                        ois.close();
                    }
                } catch (IOException ex) {
                    logger.warn(ex);
                }
            }

        }

        if (savedObject instanceof Cloneable) {
            try {
                T clone = (T) savedObject.getClass().getMethod("clone").invoke(savedObject);
            } catch (NoSuchMethodException | SecurityException | IllegalAccessException | IllegalArgumentException | InvocationTargetException ex) {
                logger.trace(ex);
            }
        }

        logger.warn(clazz
                + " not copyable, object mutation will change the object in memory \n "
                + " please create an issue: " + dataType + " not copyable");
        return savedObject;

    }

    @Override
    public <S extends T> Class<S> getDataType() {
        return (Class<S>) dataType;
    }

    @Override
    public void cleanUp() {
        logger.trace("clean up");
        savedObject = null;
    }

    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {
        //no configuration needed
    }

}
