package de.unibi.citec.clf.bonsai.util.reflection;



import java.util.Set;

/**
 * Interface for classes that can retrieve other classes via an interface.
 * 
 * @author jwienke
 */
public interface ServiceDiscovery {

    /**
     * Returns a list of class objects for classes that implement a given
     * service interface.
     * 
     * @param <T>
     *            interface class type
     * @param iFace
     *            interface class object
     * @return list of known service classes implementing the interface
     */
    <T> Set<Class<? extends T>> discoverServicesByInterface(Class<T> iFace);

}
