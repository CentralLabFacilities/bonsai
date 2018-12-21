package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.MissingKeyConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.ParameterCastConfigurationException;
import org.apache.log4j.Logger;

import java.util.*;
import java.util.Map.Entry;

/**
 * @author lruegeme
 */
public class ObjectConfigurator implements IObjectConfigurator {

    public static final String BLOCKED_ERROR = "Configurator is blocked, had errors during configuration";
    Logger logger = Logger.getLogger(ObjectConfigurator.class);

    private enum ObjectConfigurationPhase {
        CONFIG, OBJECT, BLOCKED
    }

    private Map<String, Object> values = new HashMap<>();
    private Map<String, Class> requestedParams = new HashMap<>();
    private Map<String, Class> optionalParams = new HashMap<>();
    private Map<String, String> unusedParams = new HashMap<>();
    private ObjectConfigurationPhase phase = ObjectConfigurationPhase.BLOCKED;
    private List<ConfigurationException> exceptions = new LinkedList<>();

    public static ObjectConfigurator createConfigPhase() {
        return new ObjectConfigurator(ObjectConfigurationPhase.CONFIG);
    }

    public void activateObjectPhase(Map<String, String> params) throws ConfigurationException {
        phase = ObjectConfigurationPhase.BLOCKED;
        Set<String> unusedKeys = new HashSet<>(params.keySet());

        for (Entry<String, String> entry : params.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (requestedParams.containsKey(key)) {
                Class c = requestedParams.get(key);
                try {
                    values.put(key, castValue(value, c));
                } catch (ConfigurationException e) {
                    exceptions.add(new ParameterCastConfigurationException(key, c, value));
                }
            } else if (optionalParams.containsKey(key)) {
                Class c = optionalParams.get(key);
                try {
                    values.put(key, castValue(value, c));
                } catch (ConfigurationException e) {
                    exceptions.add(new ConfigurationException(
                            "optional parameter: '" + key + "' with type '" + c
                                    + "' could not be parsed, value:'" + value + "'"));
                }
            }
        }
        unusedKeys.removeAll(requestedParams.keySet());
        unusedKeys.removeAll(optionalParams.keySet());

        unusedKeys.forEach(key -> unusedParams.put(key, params.get(key)));
        optionalParams.keySet().removeAll(params.keySet());
        requestedParams.keySet().removeAll(params.keySet());

        for (Entry<String, Class> e : requestedParams.entrySet()) {
            exceptions.add(new MissingKeyConfigurationException(e.getKey(), e.getValue()));
        }
        if (!exceptions.isEmpty()) {
            throw new ConfigurationException("error parsing params");
        }

        phase = ObjectConfigurationPhase.OBJECT;

    }

    private ObjectConfigurator(ObjectConfigurationPhase phase) {
        this.phase = phase;
    }

    public List<ConfigurationException> getExceptions() {
        return exceptions;
    }

    public Map<String, Class> getUnusedOptionalParams() {
        return optionalParams;
    }

    private <T> T castValue(String value, Class<T> type) throws ConfigurationException {
        try {
            if (type.equals(Double.class)) {
                return (T) (Double) Double.parseDouble(value);
            } else if (type == Integer.class) {
                return (T) (Integer) Integer.parseInt(value);
            } else if (type == Boolean.class) {
                if (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")) {
                    return (T) (Boolean) Boolean.parseBoolean(value);
                }
            } else {
                return (T) value;
            }
        } catch (NumberFormatException e) {
            logger.warn(e);
        }

        throw new ConfigurationException("could not read value:'" + value + "' as type:'" + type + "'");

    }

    private <T> T getValue(String key, T def, Class<T> type) throws ConfigurationException {
        T val = null;

        Object o = values.getOrDefault(key, def);
        if (o == null) {
            throw new ConfigurationException("could not fetch required param '" + key + "' with type " + type);
        }

        try {
            val = (T) o;
        } catch (Exception ex) {
            throw new ConfigurationException("could not fetch param '" + key + "' with type " + type);
        }
        return val;
    }

    @Override
    public int requestInt(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                requestedParams.put(key, Integer.class);
                return 0;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, null, Integer.class);
        }
    }

    @Override
    public int requestOptionalInt(String key, int def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                optionalParams.put(key, Integer.class);
                return def;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, def, Integer.class);
        }
    }

    @Override
    public double requestDouble(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                requestedParams.put(key, Double.class);
                return 0.0;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, null, Double.class);
        }
    }

    @Override
    public double requestOptionalDouble(String key, double def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                optionalParams.put(key, Double.class);
                return def;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, def, Double.class);
        }

    }

    @Override
    public String requestValue(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                requestedParams.put(key, String.class);
                return "";
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, null, String.class);
        }

    }

    @Override
    public String requestOptionalValue(String key, String def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                optionalParams.put(key, String.class);
                return def;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, def, String.class);
        }

    }

    @Override
    public boolean requestBool(String key) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                requestedParams.put(key, Boolean.class);
                return false;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, null, Boolean.class);
        }
    }

    @Override
    public boolean requestOptionalBool(String key, boolean def) throws ConfigurationException {
        switch (phase) {
            case CONFIG:
                optionalParams.put(key, Boolean.class);
                return def;
            case BLOCKED:
                throw new ConfigurationException(BLOCKED_ERROR);
            default:
                return getValue(key, def, Boolean.class);
        }
    }

}
