package de.unibi.citec.clf.btl.ros2;

import de.unibi.citec.clf.btl.Type;
import id.jrosmessages.Message;
import org.apache.log4j.Logger;


public abstract class Ros2Serializer<T extends Type, M extends Message> {

    private Logger logger = Logger.getLogger(getClass());

    public abstract M serialize(T data) throws SerializationException;

    public abstract T deserialize(M msg) throws DeserializationException;

    public abstract Class<M> getMessageType();

    public abstract Class<T> getDataType();

    public static class SerializationException extends Exception {

        private static final long serialVersionUID = -132203105128523928L;

        public SerializationException() {
            super();
        }

        public SerializationException(String message, Throwable cause) {
            super(message, cause);
        }

        public SerializationException(String message) {
            super(message);
        }

        public SerializationException(Throwable cause) {
            super(cause);
        }
    }

    public static class DeserializationException extends Exception {

        private static final long serialVersionUID = 7350863188260012099L;

        public DeserializationException() {
            super();
        }

        public DeserializationException(String message, Throwable cause) {
            super(message, cause);
        }

        public DeserializationException(String message) {
            super(message);
        }

        public DeserializationException(Throwable cause) {
            super(cause);
        }
    }
}
