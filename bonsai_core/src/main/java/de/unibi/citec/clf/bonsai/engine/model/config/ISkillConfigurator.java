package de.unibi.citec.clf.bonsai.engine.model.config;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.object.*;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;

/**
 * @author lruegeme
 */
public interface ISkillConfigurator extends IObjectConfigurator {

    <T> Sensor<T> getSensor(
            String sensorName,
            Class<T> dataType
    ) throws SkillConfigurationException;

    <T extends Actuator> T getActuator(
            String actuatorName,
            Class<T> actuatorType
    ) throws SkillConfigurationException;


    @Deprecated
    default <T> MemorySlot<T> getSlot(
            String slotName,
            Class<T> slotType
    ) throws SkillConfigurationException {
        return getSlot(slotName, slotType, "");
    }

    @Deprecated
    <T> MemorySlot<T> getSlot(
            String slotName,
            Class<T> slotType,
            String description
    ) throws SkillConfigurationException;


    default <T> MemorySlotReader<T> getReadSlot(
            String slotName,
            Class<T> slotType
    ) throws SkillConfigurationException {
        return getReadSlot(slotName, slotType, "");
    }

    <T> MemorySlotReader<T> getReadSlot(
            String slotName,
            Class<T> slotType,
            String description
    ) throws SkillConfigurationException;


    default <T> MemorySlot<T> getReadWriteSlot(
            String slotName,
            Class<T> slotType
    ) throws SkillConfigurationException {
        return getReadWriteSlot(slotName, slotType, "");
    }

    <T> MemorySlot<T> getReadWriteSlot(
            String slotName,
            Class<T> slotType,
            String description
    ) throws SkillConfigurationException;


    default <T> MemorySlotWriter<T> getWriteSlot(
            String slotName,
            Class<T> slotType
    ) throws SkillConfigurationException {
        return getWriteSlot(slotName, slotType, "");
    }

    <T> MemorySlotWriter<T> getWriteSlot(
            String slotName,
            Class<T> slotType,
            String description
    ) throws SkillConfigurationException;


    TransformLookup getTransform()
            throws SkillConfigurationException;


    default ExitToken requestExitToken(
            ExitStatus status
    ) throws SkillConfigurationException {
        return requestExitToken(status, "");
    }

    ExitToken requestExitToken(
            ExitStatus status,
            String description
    ) throws SkillConfigurationException;


    boolean hasConfigurationKey(String key);

    Iterable<String> getConfigurationKeys();
}