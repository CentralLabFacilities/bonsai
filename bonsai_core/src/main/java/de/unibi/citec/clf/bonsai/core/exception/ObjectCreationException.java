package de.unibi.citec.clf.bonsai.core.exception;

/**
 * Exception indicating an error during skill Configuration.
 *
 * @author lruegeme
 */
public class ObjectCreationException extends ConfigurationException {

    private static final long serialVersionUID = -8111248937260206718L;

    public final String objectKey;
    public final Class<?> objectClass;
    public final String objectType;

    public ObjectCreationException(String key, Class<?> object, String objectType) {
        super("Could not create " + objectType + ": '" + key + "' with type '" + object + "'");
        objectKey = key;
        objectClass = object;
        this.objectType = objectType;
    }

    String message;
}
