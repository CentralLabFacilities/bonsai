package de.unibi.citec.clf.btl;


import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.units.TimeUnit;

import java.util.Objects;

/**
 * General base class for every data type in the java btl. Every type is at
 * least specified by a generator and timestamps.
 *
 * @author jwienke
 */
public abstract class StampedType extends Type {

    public static final String LOCAL_FRAME = "base_link";
    public static final String GLOBAL_FRAME = "map";

    protected Timestamp timestamp = new Timestamp();
    protected String frameId = "";

    /**
     * Every type should be default constructible.
     */
    public StampedType() {
    }

    /**
     * Copy type.
     */
    public StampedType(StampedType other) {
        timestamp = new Timestamp(other.timestamp);
        generator = other.generator;
        frameId = other.frameId;
    }

    /**
     * Sets the timestamp using a single millisecond value.
     *
     * @param timestamp The timestamp as a long value unix time.
     */
    public final void setTimestamp(long timestamp, TimeUnit unit) {
        this.timestamp = new Timestamp(timestamp, unit);
    }

    /**
     * Sets the timestamps associated with this type.
     *
     * @param timestamp timstamps to set
     */
    public final void setTimestamp(Timestamp timestamp) {
        if (timestamp == null) {
            logger.error("Inserted timestamp was null");
            throw new IllegalArgumentException("Timestamp must not be null.");
        }
        this.timestamp = timestamp;
    }

    /**
     * Uses the current system time as new timestamp for this class.
     */
    public final void setTimestampNow() {
        this.timestamp = new Timestamp();
    }

    /**
     * Returns the timestamps associated with this type.
     *
     * @return timestamp timstamps
     */
    public final Timestamp getTimestamp() {
        assert (timestamp != null) : "Parsing must have set the timestamp.";
        return timestamp;
    }


    /**
     * Returns the coordinate frame id of this type.
     *
     * @return the coordinate frame id of this type.
     */
    public String getFrameId() {
        return frameId;
    }

    public boolean isInBaseFrame() {
        return frameId.equals(LOCAL_FRAME);
    }

    /**
     * Sets the coordinate frame id of this type.
     *
     * @param frameId the new coordinate frame id
     */
    public void setFrameId(String frameId) {
        this.frameId = frameId;
    }

    @Override
    public int hashCode() {

        return Objects.hash(timestamp, frameId, id);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        StampedType type = (StampedType) o;
        return Objects.equals(frameId, type.frameId);
    }
}
