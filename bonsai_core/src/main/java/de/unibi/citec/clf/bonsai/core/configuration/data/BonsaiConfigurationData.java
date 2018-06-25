package de.unibi.citec.clf.bonsai.core.configuration.data;

import java.util.Map;

/**
 *
 * @author lruegeme
 */
public class BonsaiConfigurationData {

    public Map<String, ActuatorData> actuators;
    public Map<String, SensorData> sensors;
    public Map<String, FactoryData> factories;
    public Map<String, MemoryData> memories;
    public TransformerData transformer;

}
