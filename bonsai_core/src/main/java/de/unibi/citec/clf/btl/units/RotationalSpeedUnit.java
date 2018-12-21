package de.unibi.citec.clf.btl.units;


/**
 * This {@link Enum} is supposed to keep track of the meaning of rotational speed values.
 * Any methods using rotational speed values should let the user specify if the given or
 * requested value is a radian value or a degree value.
 *
 * @author lziegler
 */
public enum RotationalSpeedUnit {
    RADIANS_PER_SEC, DEGREES_PER_SEC
}
