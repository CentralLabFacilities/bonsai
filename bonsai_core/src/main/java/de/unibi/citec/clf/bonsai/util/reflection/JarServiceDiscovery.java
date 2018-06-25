package de.unibi.citec.clf.bonsai.util.reflection;



import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

import org.apache.log4j.Logger;

import sun.misc.Service;

/**
 * An implementation of {@link ServiceDiscovery} that uses the jar file services
 * mechanism to find services.
 * 
 * @see <a
 *      href="http://java.sun.com/javase/6/docs/technotes/guides/jar/jar.html#Service%20Provider">JAR
 *      File Specification - Service Provider</a>
 * @author jwienke
 */
@SuppressWarnings("restriction")
@Deprecated
public class JarServiceDiscovery implements ServiceDiscovery {

    private Logger logger = Logger.getLogger(getClass());

    @SuppressWarnings("unchecked")
    @Override
    public <T> Set<Class<? extends T>> discoverServicesByInterface(Class<T> iFace) {

        logger.info("Discovering JAR services for interface " + iFace);

        Set<Class<? extends T>> classes = new HashSet<>();

        @SuppressWarnings("rawtypes")
        Iterator ps = Service.providers(iFace);
        while (ps.hasNext()) {
            T t = (T) ps.next();
            Class<?> clazz = t.getClass();
            logger.debug("Discovered service class " + clazz);
            classes.add((Class<T>) clazz);
        }

        logger.info("Discovered instances of " + iFace + ": " + classes);

        return classes;

    }

}
