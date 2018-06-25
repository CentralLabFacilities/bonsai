package de.unibi.citec.clf.btl.units;



/**
 * This {@link Enum} is supposed to keep track of the meaning of angle values.
 * Any methods using angle values should let the user specify if the given or
 * requested value is a radian value or a degree value. See
 * {@link de.unibi.citec.clf.btl.data.geometry.Point2D} for example usage.
 * 
 * @author lziegler
 */
public enum AngleUnit {
	RADIAN, DEGREE
}
