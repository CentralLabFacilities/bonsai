package de.unibi.citec.clf.bonsai.engine.model.config;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;

/**
 * @author lruegeme
 */
public interface ISkillConfigurator extends IObjectConfigurator {

    <T> Sensor<T> getSensor(String sensorName, Class<T> dataType) throws SkillConfigurationException;

    <T extends Actuator> T getActuator(String actuatorName, Class<T> actuatorType) throws SkillConfigurationException;

    @Deprecated
    <T> MemorySlot<T> getSlot(String slotName, Class<T> slotType) throws SkillConfigurationException;

    <T> MemorySlotReader<T> getReadSlot(String slotName, Class<T> slotType) throws SkillConfigurationException;

    <T> MemorySlot<T> getReadWriteSlot(String slotName, Class<T> slotType) throws SkillConfigurationException;

    <T> MemorySlotWriter<T> getWriteSlot(String slotName, Class<T> slotType) throws SkillConfigurationException;

    public TransformLookup getTransform() throws SkillConfigurationException;

    ExitToken requestExitToken(ExitStatus status) throws SkillConfigurationException;

    boolean hasConfigurationKey(String key);
}
