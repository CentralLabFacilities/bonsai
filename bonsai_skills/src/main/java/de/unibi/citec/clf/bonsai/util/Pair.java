package de.unibi.citec.clf.bonsai.util;



/**
 * A combination of two objects of the same type. This pair is immutable, but
 * the contained objects are not, in general.
 * 
 * @author dklotz
 * @param <T>
 *            The type of the two objects.
 *            
 * TODO Unit Test
 */
public class Pair<T> {

    /** The first object of the pair. */
    private final T first;
    /** The second object of the pair. */
    private final T second;

    /**
     * Creates a new pair.
     * 
     * @param first
     *            The first object.
     * @param second
     *            The second object.
     */
    public Pair(T first, T second) {
        this.first = first;
        this.second = second;
    }

    /**
     * Returns the first entry of the pair.
     * 
     * @return first entry
     */
    public T getFirst() {
        return first;
    }

    /**
     * Returns the second entry of the pair.
     * 
     * @return second entry
     */
    public T getSecond() {
        return second;
    }

    /*
     * (non-Javadoc)
     * 
     * @see java.lang.Object#equals(java.lang.Object)
     */
    @SuppressWarnings("unchecked")
    @Override
    public boolean equals(Object obj) {
        // We can only be equal to other pairs.
        if (!(obj instanceof Pair)) {
            return false;
        }

        Pair<?> other = (Pair<?>) obj;

        // We are equal if both objects are equal.
        return getFirst().equals(other.getFirst())
                && getSecond().equals(other.getSecond());
    }

    /*
     * (non-Javadoc)
     * 
     * @see java.lang.Object#hashCode()
     */
    @Override
    public int hashCode() {
        // Return a combination of both objects hashcodes.
        // The factors are there so this is not symmetric (the order of first
        // and second matters).
        // CHECKSTYLE:OFF
        return 32 * getFirst().hashCode() + 42 * getSecond().hashCode();
        // CHECKSTYLE:ON
    }

    /*
     * (non-Javadoc)
     * 
     * @see java.lang.Object#toString()
     */
    @Override
    public String toString() {
        String firstString = null;
        if (getFirst() != null) {
            firstString = getFirst().toString();
        }

        String secondString = null;
        if (getSecond() != null) {
            secondString = getSecond().toString();
        }

        return "[" + firstString + ", " + secondString + "]";
    }

}
