package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.knowledge.Attributes;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Future;


/**
 * Interface for actuator that gets knowledge
 * 
 * @author lruegeme
 */
public interface KnowledgeActuator extends Actuator {

    Future<Attributes> getAttributes(String reference);
}
