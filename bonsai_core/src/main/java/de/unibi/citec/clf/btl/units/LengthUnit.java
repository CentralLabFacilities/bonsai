package de.unibi.citec.clf.btl.units;


/**
 * This {@link Enum} is supposed to keep track of the meaning of length values.
 * Any methods using length values should let the user specify if the given or
 * requested value is in meters, centimeters or an other unit. See
 * {@link de.unibi.citec.clf.btl.data.geometry.Point2D} for example usage.
 *
 * @author lziegler
 */
public enum LengthUnit {
    MILLIMETER, CENTIMETER, METER
}
