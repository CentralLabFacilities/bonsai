package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;

import javax.annotation.Nonnull;

/**
 * @author lruegeme
 */
public interface IObjectConfigurator {

    default int requestInt(String key) throws ConfigurationException {
        return requestInt(key, "");
    }

    int requestInt(String key, String description)
            throws ConfigurationException;

    default int requestOptionalInt(String key, int def)
            throws ConfigurationException {
        return requestOptionalInt(key, def, "");
    }

    int requestOptionalInt(String key, int def, String description)
            throws ConfigurationException;


    default double requestDouble(String key)
            throws ConfigurationException {
        return requestDouble(key, "");
    }

    double requestDouble(String key, String description)
            throws ConfigurationException;

    default double requestOptionalDouble(String key, double def)
            throws ConfigurationException {
        return requestOptionalDouble(key, def, "");
    }

    double requestOptionalDouble(
            String key,
            double def,
            String description
    ) throws ConfigurationException;


    default float requestFloat(String key)
            throws ConfigurationException {
        return requestFloat(key, "");
    }

    float requestFloat(String key, String description)
            throws ConfigurationException;

    default float requestOptionalFloat(String key, float def)
            throws ConfigurationException {
        return requestOptionalFloat(key, def, "");
    }

    float requestOptionalFloat(
            String key,
            float def,
            String description
    ) throws ConfigurationException;


    default String requestValue(String key)
            throws ConfigurationException {
        return requestValue(key, "");
    }

    String requestValue(String key, String description)
            throws ConfigurationException;

    default String requestOptionalValue(String key, String def)
            throws ConfigurationException {
        return requestOptionalValue(key, def, "");
    }

    String requestOptionalValue(
            String key,
            String def,
            String description
    ) throws ConfigurationException;


    default boolean requestBool(String key)
            throws ConfigurationException {
        return requestBool(key, "");
    }

    boolean requestBool(String key, String description)
            throws ConfigurationException;

    default boolean requestOptionalBool(String key, boolean def)
            throws ConfigurationException {
        return requestOptionalBool(key, def, "");
    }

    boolean requestOptionalBool(
            String key,
            boolean def,
            String description
    ) throws ConfigurationException;
}