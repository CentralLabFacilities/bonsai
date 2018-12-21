package de.unibi.citec.clf.btl;


/**
 * Generic type for collections of BTL types.
 *
 * @param <T> The type of the list elements.
 */
public abstract class TypeCollection<T extends Type> extends Type implements java.util.Collection<T> {

    public Class<T> elementType;

    /**
     * Create a new list.
     *
     * @param type The type of the elements.
     */
    public TypeCollection(Class<T> type) {
        this.elementType = type;
    }

    /**
     * Copy a list.
     */
    public TypeCollection(final TypeCollection<T> list) {
        this.elementType = list.elementType;
    }

    /**
     * Getter for the type of the elements.
     *
     * @return The type of the elements.
     */
    public Class<T> getElementType() {
        return elementType;
    }

    @Override
    public String toString() {
        String s = "TypeCollection<" + elementType.getSimpleName() + ">[";
        boolean first = true;
        for (T t : this) {
            if (!first) {
                s += ",";
            }
            s += t.toString();
            first = false;
        }
        s += "]";
        return s;
    }
}
