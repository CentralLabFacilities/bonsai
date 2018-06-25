package de.unibi.citec.clf.btl.ros;

import de.unibi.citec.clf.btl.Type;
import org.apache.log4j.Logger;
import org.ros.internal.message.Message;
import org.ros.message.MessageFactory;


public abstract class RosSerializer<T extends Type, M extends Message> {

    private Logger logger = Logger.getLogger(getClass());

    public abstract M serialize(T data, MessageFactory fact) throws SerializationException;

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
