package de.unibi.citec.clf.bonsai.core.configuration.data;

import java.util.HashMap;
import java.util.Map;

/**
 * @author lruegeme
 */
public class BonsaiConfigurationData {

    public Map<String, String> options = new HashMap<>();
    public Map<String, ActuatorData> actuators = new HashMap<>();
    public Map<String, SensorData> sensors = new HashMap<>();
    public Map<String, FactoryData> factories = new HashMap<>();;
    public Map<String, MemoryData> memories = new HashMap<>();;
    public TransformerData transformer;

}
