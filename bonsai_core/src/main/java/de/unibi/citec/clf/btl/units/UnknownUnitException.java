package de.unibi.citec.clf.btl.units;


/**
 * This exception indicates, that a conversion can not be done, because one
 * of the given units is not known to the converter.
 *
 * @author lziegler
 */
public class UnknownUnitException extends RuntimeException {
    private static final long serialVersionUID = 2817908982356365437L;

    public UnknownUnitException(String message) {
        super(message);
    }
}
