package de.unibi.citec.clf.btl.units;


/**
 * This helper class converts any value from any unit to any other unit.
 *
 * @author lziegler
 */
public class UnitConverter {

    /**
     * Converts an long value from any time unit to any other time unit;
     *
     * @param value The long value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An long value, that corresponds to the given value, but in the
     * desired time unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static long convert(long value, TimeUnit from, TimeUnit to)
            throws UnknownUnitException {
        long asMicroSeconds = convertFrom(value, from);
        return convertTo(asMicroSeconds, to);
    }

    /**
     * Converts an integer value from any length unit to any other length unit.
     * The return value will be rounded, if the target unit is more general than
     * the source unit.
     *
     * @param value The integer value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An integer value, that corresponds to the given value, but in the
     * desired length unit. This value will be rounded, if the desired
     * unit is a more general one.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static int convert(int value, LengthUnit from, LengthUnit to)
            throws UnknownUnitException {
        float asMillimeter = convertFrom(value, from);
        return Math.round(convertTo(asMillimeter, to));
    }

    /**
     * Converts an long value from any length unit to any other length unit. The
     * return value will be rounded, if the target unit is more general than the
     * source unit.
     *
     * @param value The long value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An long value, that corresponds to the given value, but in the
     * desired length unit. This value will be rounded, if the desired
     * unit is a more general one.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static long convert(long value, LengthUnit from, LengthUnit to)
            throws UnknownUnitException {
        double asMillimeter = convertFrom(value, from);
        return Math.round(convertTo(asMillimeter, to));
    }

    /**
     * Converts an double value from any length unit to any other length unit;
     *
     * @param value The double value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An double value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static double convert(double value, LengthUnit from, LengthUnit to)
            throws UnknownUnitException {
        double asMillimeter = convertFrom(value, from);
        return convertTo(asMillimeter, to);
    }

    /**
     * Converts an float value from any length unit to any other length unit;
     *
     * @param value The float value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An float value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static float convert(float value, LengthUnit from, LengthUnit to)
            throws UnknownUnitException {
        float asMillimeter = convertFrom(value, from);
        return convertTo(asMillimeter, to);
    }

    /**
     * Converts an double value from any angle unit to any other angle unit;
     *
     * @param value The double value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An double value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static double convert(double value, AngleUnit from, AngleUnit to)
            throws UnknownUnitException {
        double asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    /**
     * Converts an float value from any angle unit to any other angle unit;
     *
     * @param value The float value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An float value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static float convert(float value, AngleUnit from, AngleUnit to)
            throws UnknownUnitException {
        float asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    /**
     * Converts an double value from any speed unit to any other speed unit;
     *
     * @param value The double value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An double value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static double convert(double value, SpeedUnit from, SpeedUnit to)
            throws UnknownUnitException {
        double asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    /**
     * Converts an float value from any speed unit to any other speed unit;
     *
     * @param value The float value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An float value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static float convert(float value, SpeedUnit from, SpeedUnit to)
            throws UnknownUnitException {
        float asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    /**
     * Converts an double value from any rotational speed unit to any other rotational speed unit;
     *
     * @param value The double value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An double value, that corresponds to the given value, but in the
     * desired rotational speed unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static double convert(double value, RotationalSpeedUnit from, RotationalSpeedUnit to)
            throws UnknownUnitException {
        double asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    /**
     * Converts an float value from any speed unit to any other speed unit;
     *
     * @param value The float value to convert.
     * @param from  The unit of the given value.
     * @param to    The desired unit.
     * @return An float value, that corresponds to the given value, but in the
     * desired length unit.
     * @throws UnknownUnitException Is thrown if the converter does not know one of the given
     *                              units.
     */
    public static float convert(float value, RotationalSpeedUnit from, RotationalSpeedUnit to)
            throws UnknownUnitException {
        float asRadiant = convertFrom(value, from);
        return convertTo(asRadiant, to);
    }

    private static double convertFrom(double value, LengthUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER:
                return value * 1000d;
            case CENTIMETER:
                return value * 10d;
            case MILLIMETER:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static double convertTo(double value, LengthUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER:
                return value / 1000d;
            case CENTIMETER:
                return value / 10d;
            case MILLIMETER:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static float convertFrom(float value, LengthUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER:
                return value * 1000f;
            case CENTIMETER:
                return value * 10f;
            case MILLIMETER:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static float convertTo(float value, LengthUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER:
                return value / 1000f;
            case CENTIMETER:
                return value / 10f;
            case MILLIMETER:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static double convertFrom(double value, AngleUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case DEGREE:
                return value / 180.0 * Math.PI;
            case RADIAN:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static double convertTo(double value, AngleUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case DEGREE:
                return value / Math.PI * 180.0;
            case RADIAN:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static float convertFrom(float value, AngleUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case DEGREE:
                return value / 180f * (float) Math.PI;
            case RADIAN:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static float convertTo(float value, AngleUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case DEGREE:
                return value / (float) Math.PI * 180f;
            case RADIAN:
                return value;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }


    private static double convertFrom(double value, SpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER_PER_SEC:
                return value;
            case KILOMETER_PER_HOUR:
                return value / 3.6;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static double convertTo(double value, SpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER_PER_SEC:
                return value;
            case KILOMETER_PER_HOUR:
                return value * 3.6;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static float convertFrom(float value, SpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER_PER_SEC:
                return value;
            case KILOMETER_PER_HOUR:
                return value / 3.6f;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static float convertTo(float value, SpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case METER_PER_SEC:
                return value;
            case KILOMETER_PER_HOUR:
                return value * 3.6f;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static float convertFrom(float value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case RADIANS_PER_SEC:
                return value;
            case DEGREES_PER_SEC:
                return value / 180f * (float) Math.PI;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static float convertTo(float value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case RADIANS_PER_SEC:
                return value;
            case DEGREES_PER_SEC:
                return value / (float) Math.PI * 180f;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static double convertFrom(double value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case RADIANS_PER_SEC:
                return value;
            case DEGREES_PER_SEC:
                return value / 180f * (double) Math.PI;
            default:
                throw new UnknownUnitException("Don't know how to convert from "
                        + unit.name());
        }
    }

    private static double convertTo(double value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case RADIANS_PER_SEC:
                return value;
            case DEGREES_PER_SEC:
                return value / (double) Math.PI * 180f;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static long convertTo(long value, TimeUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case MICROSECONDS:
                return value;
            case MILLISECONDS:
                return value / 1000L;
            case SECONDS:
                return convertTo(value, TimeUnit.MILLISECONDS) / 1000L;
            case MINUTES:
                return convertTo(value, TimeUnit.SECONDS) / 60L;
            case HOURS:
                return convertTo(value, TimeUnit.MINUTES) / 60L;
            case DAYS:
                return convertTo(value, TimeUnit.HOURS) / 24L;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }

    private static long convertFrom(long value, TimeUnit unit)
            throws UnknownUnitException {
        switch (unit) {
            case MICROSECONDS:
                return value;
            case MILLISECONDS:
                return value * 1000L;
            case SECONDS:
                return convertFrom(value, TimeUnit.MILLISECONDS) * 1000L;
            case MINUTES:
                return convertFrom(value, TimeUnit.SECONDS) * 60L;
            case HOURS:
                return convertFrom(value, TimeUnit.MINUTES) * 60L;
            case DAYS:
                return convertFrom(value, TimeUnit.HOURS) * 24L;
            default:
                throw new UnknownUnitException("Don't know how to convert to "
                        + unit.name());
        }
    }
}
