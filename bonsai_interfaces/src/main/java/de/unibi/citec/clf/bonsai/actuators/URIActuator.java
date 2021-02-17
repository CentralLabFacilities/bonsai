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

    Future<String> getRequest(URI uri, Map<String,String> query);

}
