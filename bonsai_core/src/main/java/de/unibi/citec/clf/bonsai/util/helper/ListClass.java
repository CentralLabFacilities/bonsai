package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.btl.Type;

/**
 * A custom class object container for sensors using List types.
 *
 * @param <T> The data type managed by received lists.
 * @author lziegler
 */
public class ListClass<T extends Type> {

    public Class<T> dataType;
    public Class<? extends de.unibi.citec.clf.btl.List<T>> listType;

    public ListClass(Class<T> dataType, Class<? extends de.unibi.citec.clf.btl.List<T>> listType) {
        super();
        this.dataType = dataType;
        this.listType = listType;
    }
}
