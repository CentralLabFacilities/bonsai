package de.unibi.citec.clf.bonsai.util.reflection;


import org.apache.log4j.Logger;
import org.reflections.Reflections;

import java.util.Set;


public class ReflectionServiceDiscovery implements ServiceDiscovery {

    private Logger logger = Logger.getLogger(getClass());
    private String pkg;

    public ReflectionServiceDiscovery(String pkg) {
        this.pkg = pkg;
    }

    @Override
    public <T> Set<Class<? extends T>> discoverServicesByInterface(Class<T> iFace) {

        //TODO read package from config or something
        logger.warn("discoverServicesByInterface is using '" + pkg + "' package");
        Reflections reflections = new Reflections(pkg);

        //de.unibi.citec.clf.bonsai.rsb.configuration
        //de.unibi.citec.clf.bonsai.ros.configuration

        Set<Class<? extends T>> allClasses = reflections.getSubTypesOf(iFace);

        return allClasses;

        //String pkg = "de.unibi.citec.clf.bonsai.rsb.configuration";
        //
    }

}
