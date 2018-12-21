package de.unibi.citec.clf.btl.data.common;


import java.util.concurrent.TimeUnit;

/**
 * A timestamp with microseconds precision.
 *
 * @author jwienke
 * @author dklotz
 */
public class MicroTimestamp {

    protected long seconds = 0;
    protected long microSeconds = 0;

    /**
     * Creates a timestamp with a value of 0 seconds and 0 microseconds.
     */
    public MicroTimestamp() {
    }

    /**
     * Creates a timestamp with a value of 0 seconds and 0 microseconds.
     */
    public MicroTimestamp(MicroTimestamp t) {
        seconds = t.seconds;
        microSeconds = t.microSeconds;
    }

    /**
     * Creates a timestamp with the given value, converting it from the given
     * time unit to seconds and microseconds.
     *
     * <b>WARNING:</b> This timestamp only has microseconds precision
     * internally, so giving it a value that is smaller / more precise than 1
     * microseconds (for example in nanoseconds) WILL loose precision.
     *
     * @param value The time value.
     * @param unit  The time unit.
     * @see TimeUnit
     */
    public MicroTimestamp(long value, TimeUnit unit) {
        this.setInUnit(value, unit);
    }

    /**
     * Creates a timestamp with the given seconds as a value.
     *
     * @param seconds The value in seconds.
     */
    public MicroTimestamp(long seconds) {
        setSeconds(seconds);
    }

    /**
     * Creates a timestamp with microsecond precision with the given time.
     *
     * @param seconds      The timestamps seconds part.
     * @param microSeconds The timestamps microseconds part (i.e. only the part below
     *                     1s).
     */
    public MicroTimestamp(long seconds, long microSeconds) {
        setSeconds(seconds);
        setMicroSeconds(microSeconds);
    }

    public long getSeconds() {
        return seconds;
    }

    public void setSeconds(long seconds) {
        this.seconds = seconds;
    }

    public long getMicroSeconds() {
        return microSeconds;
    }

    public void setMicroSeconds(long microSeconds) {
        if (microSeconds >= 1000000 || microSeconds < 0) {
            throw new IllegalArgumentException(
                    "Microseconds can only be >= 0 and < 1000000");
        }
        this.microSeconds = microSeconds;
    }

    /**
     * Gets this timestamps value in an arbitrary {@link TimeUnit}.
     *
     * @param unit The unit of time to convert this timestamp into.
     * @return The value of this timestamp in the given unit.
     */
    public long getInUnit(TimeUnit unit) {
        long secondsConverted = unit.convert(seconds, TimeUnit.SECONDS);
        long microSecondsConverted = unit.convert(microSeconds,
                TimeUnit.MICROSECONDS);

        return secondsConverted + microSecondsConverted;
    }

    /**
     * Sets the timestamp to the given value, converting it from the given time
     * unit to seconds and microseconds.
     *
     * <b>WARNING:</b> This timestamp only has microseconds precision
     * internally, so giving it a value that is smaller / more precise than 1
     * microseconds (for example in nanoseconds) WILL loose precision.
     *
     * @param value The time value.
     * @param unit  The time unit.
     * @see TimeUnit
     */
    public void setInUnit(long value, TimeUnit unit) {
        // Convert value to seconds (loosing everything below second precision)
        long secondsConverted = TimeUnit.SECONDS.convert(value, unit);
        setSeconds(secondsConverted);

        // Substract the second part from the whole value [original unit]
        long valueMicroSecondsPart = value
                - unit.convert(secondsConverted, TimeUnit.SECONDS);
        // Convert it to microseconds
        long microSecondsConverted = TimeUnit.MICROSECONDS.convert(
                valueMicroSecondsPart, unit);
        setMicroSeconds(microSecondsConverted);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean equals(Object obj) {

        if (!(obj instanceof MicroTimestamp)) {
            return false;
        }

        MicroTimestamp other = (MicroTimestamp) obj;

        return (other.seconds == seconds)
                && (other.microSeconds == microSeconds);

    }

    /**
     * {@inheritDoc}
     */
    @Override
    public int hashCode() {
        return (int) (42 * seconds + 75 * microSeconds);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "MicroTimestamp [seconds = " + seconds + ", microSeconds = "
                + microSeconds + "]";
    }

}
