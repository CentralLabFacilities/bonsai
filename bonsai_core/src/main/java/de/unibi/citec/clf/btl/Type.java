package de.unibi.citec.clf.btl;


import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.units.TimeUnit;
import org.apache.log4j.Logger;

import java.io.Serial;
import java.util.Objects;

/**
 * General base class for every data type in the java btl. Every type is at
 * least specified by a generator and timestamps.
 *
 * @author jwienke
 */
public abstract class Type {

    protected String generator = "unknown";

    protected static Logger logger = Logger.getLogger(Type.class);

    protected int id = -1;

    /**
     * This is the source element, from which the current btl object was
     * parsed. If the object was not parsed from a wire document but created
     * manually, this field is null.
     */
    protected String sourceDocument = null;

    /**
     * Returns true if this instance has a memory ID.
     *
     * @return True if this instance has a memory ID.
     */
    public boolean hasMemoryId() {
        return id != -1;
    }

    /**
     * Returns the memory ID of this instance or -1.
     *
     * @return The ID of this instance or -1.
     */
    public int getMemoryId() {
        return id;
    }

    /**
     * Set the memory ID of this instance (>= 0).
     *
     * @param id New ID of this instance.
     */
    public void setMemoryId(int id) {
        if (id >= 0) {
            this.id = id;
        }
    }

    /**
     * Getter for the source document, from which the current btl object was
     * parsed. If the object was not parsed from a wire document but created
     * manually, this method returns <code>null</code>.
     *
     * @return The document from which the current btl object was parsed.
     * @throws NoSourceDocumentException Is thrown if this object was created manually and not parsed
     *                                   from a wire document.
     */
    public String getSourceDocument() throws NoSourceDocumentException {
        if (sourceDocument == null) {
            throw new NoSourceDocumentException();
        }
        return sourceDocument;
    }

    /**
     * Setter for the source element, from which the current btl object was
     * parsed.
     *
     * @param sourceDocument The document from which this object was parsed.
     */
    public void setSourceDocument(String sourceDocument) {
        this.sourceDocument = sourceDocument;
    }

    /**
     * Every type should be default constructible.
     */
    public Type() {
    }

    /**
     * Copy type.
     */
    public Type(Type other) {
        generator = other.generator;
    }

    /**
     * Sets the generator of this type.
     *
     * @param generator the new generator name
     */
    public final void setGenerator(String generator) {
        if (generator == null) {
            throw new IllegalArgumentException("Generator must not be null.");
        }
        this.generator = generator;
    }

    /**
     * Returns the generator name of this type.
     *
     * @return the generator name of this type.
     */
    public final String getGenerator() {
        assert (generator != null) : "Parsing must have set the generator.";
        return generator;
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Type type = (Type) o;
        return true;
    }

    /**
     * Exception used to declare that the current BTL object was not parsed from
     * a wire document.
     *
     * @author lziegler
     */
    public static class NoSourceDocumentException extends Exception {

        @Serial
        private static final long serialVersionUID = 3558849451905177392L;

        /**
         * Constructor.
         */
        public NoSourceDocumentException() {
            super("object has no source document. Possible reasons:"
                    + "\n * object was not parsed from a wire document"
                    + "\n * concrete btl type was not implemented properly");
        }
    }
}
