package de.unibi.citec.clf.bonsai.actuators;


import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.Future;

/**
 * Interface for Communication with an Endpoint
 * 
 * @author lruegeme
 */
public interface URIActuator extends Actuator {

    /**
     *
     * @param uri scheme + authority + path
     * @param query from map to ?key=value
     * @return the response
     */
    Future<String> getRequest(URI uri, Map<String,String> query);

    /**
     * Request to configured scheme authority
     * @param path the path
     * @param query from map to ?key=value
     * @return the response
     */
    Future<String> getRequest(String path, Map<String,String> query);
    Future<String> getRequest(String path);

}
