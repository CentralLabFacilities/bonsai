package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;

/**
 * @author lruegeme
 */
public interface IObjectConfigurator {

    int requestInt(String key) throws ConfigurationException;

    int requestOptionalInt(String key, int def) throws ConfigurationException;

    double requestDouble(String key) throws ConfigurationException;

    double requestOptionalDouble(String key, double def) throws ConfigurationException;

    float requestFloat(String key) throws ConfigurationException;

    float requestOptionalFloat(String key, float def) throws ConfigurationException;

    String requestValue(String key) throws ConfigurationException;

    String requestOptionalValue(String key, String def) throws ConfigurationException;

    boolean requestBool(String key) throws ConfigurationException;

    boolean requestOptionalBool(String key, boolean def) throws ConfigurationException;

}
