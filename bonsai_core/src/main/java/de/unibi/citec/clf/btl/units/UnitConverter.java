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
        return switch (unit) {
            case METER -> value * 1000d;
            case CENTIMETER -> value * 10d;
            case MILLIMETER -> value;
        };
    }

    private static double convertTo(double value, LengthUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER -> value / 1000d;
            case CENTIMETER -> value / 10d;
            case MILLIMETER -> value;
        };
    }

    private static float convertFrom(float value, LengthUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER -> value * 1000f;
            case CENTIMETER -> value * 10f;
            case MILLIMETER -> value;
        };
    }

    private static float convertTo(float value, LengthUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER -> value / 1000f;
            case CENTIMETER -> value / 10f;
            case MILLIMETER -> value;
        };
    }

    private static double convertFrom(double value, AngleUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case DEGREE -> value / 180.0 * Math.PI;
            case RADIAN -> value;
        };
    }

    private static double convertTo(double value, AngleUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case DEGREE -> value / Math.PI * 180.0;
            case RADIAN -> value;
        };
    }

    private static float convertFrom(float value, AngleUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case DEGREE -> value / 180f * (float) Math.PI;
            case RADIAN -> value;
        };
    }

    private static float convertTo(float value, AngleUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case DEGREE -> value / (float) Math.PI * 180f;
            case RADIAN -> value;
        };
    }


    private static double convertFrom(double value, SpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER_PER_SEC -> value;
            case KILOMETER_PER_HOUR -> value / 3.6;
        };
    }

    private static double convertTo(double value, SpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER_PER_SEC -> value;
            case KILOMETER_PER_HOUR -> value * 3.6;
        };
    }

    private static float convertFrom(float value, SpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER_PER_SEC -> value;
            case KILOMETER_PER_HOUR -> value / 3.6f;
        };
    }

    private static float convertTo(float value, SpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case METER_PER_SEC -> value;
            case KILOMETER_PER_HOUR -> value * 3.6f;
        };
    }

    private static float convertFrom(float value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case RADIANS_PER_SEC -> value;
            case DEGREES_PER_SEC -> value / 180f * (float) Math.PI;
        };
    }

    private static float convertTo(float value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case RADIANS_PER_SEC -> value;
            case DEGREES_PER_SEC -> value / (float) Math.PI * 180f;
        };
    }

    private static double convertFrom(double value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case RADIANS_PER_SEC -> value;
            case DEGREES_PER_SEC -> value / 180f * (double) Math.PI;
        };
    }

    private static double convertTo(double value, RotationalSpeedUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case RADIANS_PER_SEC -> value;
            case DEGREES_PER_SEC -> value / (double) Math.PI * 180f;
        };
    }

    private static long convertTo(long value, TimeUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case NANOSECONDS -> value * 1000L;
            case MICROSECONDS -> value;
            case MILLISECONDS -> value / 1000L;
            case SECONDS -> convertTo(value, TimeUnit.MILLISECONDS) / 1000L;
            case MINUTES -> convertTo(value, TimeUnit.SECONDS) / 60L;
            case HOURS -> convertTo(value, TimeUnit.MINUTES) / 60L;
            case DAYS -> convertTo(value, TimeUnit.HOURS) / 24L;
        };
    }

    private static long convertFrom(long value, TimeUnit unit)
            throws UnknownUnitException {
        return switch (unit) {
            case NANOSECONDS -> value / 1000L;
            case MICROSECONDS -> value;
            case MILLISECONDS -> value * 1000L;
            case SECONDS -> convertFrom(value, TimeUnit.MILLISECONDS) * 1000L;
            case MINUTES -> convertFrom(value, TimeUnit.SECONDS) * 60L;
            case HOURS -> convertFrom(value, TimeUnit.MINUTES) * 60L;
            case DAYS -> convertFrom(value, TimeUnit.HOURS) * 24L;
        };
    }
}
