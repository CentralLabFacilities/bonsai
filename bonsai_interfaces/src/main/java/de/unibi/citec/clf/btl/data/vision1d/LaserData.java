package de.unibi.citec.clf.btl.data.vision1d;


import org.apache.log4j.Logger;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.hardwareinfo.LaserInfo;
import de.unibi.citec.clf.btl.data.hardwareinfo.LaserInfo.OutOfRangeException;
import de.unibi.citec.clf.btl.data.hardwareinfo.LaserInfo.ScannerModel;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * Domain class for LaserData of BonSAI. The currently mounted Laser has a
 * resolution of 0.5 degrees and scans an angle of 180 degrees in front of the
 * robot, resulting in 361 values. Use LaserData.getAngleValue to obtain the
 * corresponding angles of value. The laser range is limited to 8 meters. The
 * resolution is about 10mm.
 *
 * @author marc
 * @author jwienke
 * @author lziegler
 */
public class LaserData extends Type {

    private final static Logger logger = Logger.getLogger(LaserData.class);

    private double[] scanValues;
    //getting value from ros
    // TODO replace this with start angle and end angle (would allow dynamic 
    // conversion between angle and scan index)
    private double scanAngle;
    public static AngleUnit iAU = AngleUnit.RADIAN;
    public static LengthUnit iLU = LengthUnit.METER;

    /**
     * @return the of values in the scanValues Array. Normally 361.
     */
    public int getNumLaserPoints() {
        return scanValues.length;
    }

    /**
     * get the value of the angle corresponding to the value at index.
     *
     * @param index of the distance value you are interested in
     * @return the value in radian. a value of 0 corresponds to the distance
     * directly in front of the robot, angles increase counter-clock-wise.
     * angles are always positive. So, a value of Math.PI/2 corresponds to the
     * left of the robot, and Math.PI*(3/2) to its right.
     */
    public static double getAngleValue(int index, AngleUnit u) {
        double correspondingAngleDeg = ((double) index) * Math.PI / 360.0
                - Math.PI / 2;
        if (correspondingAngleDeg < 0) {
            correspondingAngleDeg += 2 * Math.PI;
        }
        return UnitConverter
                .convert(correspondingAngleDeg, AngleUnit.DEGREE, u);
    }

    /**
     * @return an array which hold all scan Values (normally 361). All values
     * are in meters. If you need to know the angle of a scan use the
     * getAngleValue(int index) method.
     */
    public double[] getScanValues(LengthUnit u) {
        if (u == iLU) {
            return scanValues;
        } else {
            double[] newValues = new double[scanValues.length];
            for (int i = 0; i < scanValues.length; i++) {
                newValues[i] = UnitConverter.convert(scanValues[i], iLU, u);
            }
            return newValues;
        }
    }

    public void setScanValues(double[] scanValues, LengthUnit u) {
        if (u == iLU) {
            this.scanValues = scanValues;
        } else {
            double[] newValues = new double[scanValues.length];
            for (int i = 0; i < scanValues.length; i++) {
                newValues[i] = UnitConverter.convert(scanValues[i], u, iLU);
            }
            this.scanValues = newValues;
        }
    }

    /**
     * Getter for the scan value at a given angle.
     *
     * @param scannerModel Identity of the used laser scanner.
     * @param angle The angle of the requested value. [radiant]
     * @return The scan value at a given angle
     * @throws OutOfRangeException Is thrown if the given angle is out of the
     * laser scanners range.
     */
    public double getSingleScanValue(double angle, AngleUnit au,
            ScannerModel scannerModel, LengthUnit lu)
            throws OutOfRangeException {

        int scanNum = LaserInfo.calcScanIndex(scannerModel,
                UnitConverter.convert(angle, au, AngleUnit.RADIAN));

        return getScanValues(lu)[scanNum];
    }

    /**
     * Getter for the scan value at a given angle.
     *
     * @param angle The angle of the requested value. [radiant]
     * @return The scan value at a given angle
     * @throws OutOfRangeException Is thrown if the given angle is out of the
     * laser scanners range.
     */
    public double getSingleScanValue(double angle, AngleUnit au, LengthUnit lu)
            throws OutOfRangeException {

        int scanNum = LaserInfo.calcScanIndex(scanAngle, scanValues.length,
                UnitConverter.convert(angle, au, AngleUnit.RADIAN));

        return getScanValues(lu)[scanNum];
    }

    /**
     * Getter for an average scanner value over a given angle range.
     *
     * @param angle The angle of the requested value.
     * @param widthAngle The width of the scan window used for average the
     * value.
     * @param au Unit of the angles.
     * @param scannerModel Identity of the used laser scanner.
     * @param lu Unit of the returned length.
     * @return
     * @throws OutOfRangeException Is thrown if the given angle is out of the
     * laser scanners range.
     */
    public double getAverageScanValue(double angle, double widthAngle,
            AngleUnit au, ScannerModel scannerModel, LengthUnit lu)
            throws OutOfRangeException {

        angle = UnitConverter.convert(angle, au, AngleUnit.RADIAN);
        widthAngle = UnitConverter.convert(widthAngle, au, AngleUnit.RADIAN);

        // calculate average window
        double startAngle = angle - widthAngle / 2.0;
        double endAngle = angle + widthAngle / 2.0;
        double rangeRad = LaserInfo.getInfo(scannerModel).getRange(
                AngleUnit.RADIAN);

        // make window smaller if it exceeds the laser's range.
        double sideAngle = rangeRad / 2.0;
        if (startAngle < -sideAngle) {
            logger.info("unsupported stuff happens, did zou set lase model?");
            startAngle = -sideAngle;
        }
        if (endAngle > sideAngle) {
            logger.info("unsupported stuff happens, did zou set lase model?");
            endAngle = sideAngle;
        }

        int scanNumStart = LaserInfo.calcScanIndex(scannerModel, startAngle);
        int scanNumEnd = LaserInfo.calcScanIndex(scannerModel, endAngle);

        // calculate average
        double value = 0;
        int count = 0;
        double maxDist = LaserInfo.getInfo(scannerModel).getMaxDistance();
        maxDist = UnitConverter.convert(maxDist, iLU, lu);
        double[] sv = getScanValues(lu);
        for (int i = scanNumStart; i <= scanNumEnd; i++) {
            if (Double.isNaN(sv[i]) || Double.isInfinite(sv[i])) {
                logger.error("scan value " + i + " is NaN or Inf");
                continue;
            }
            // if (sv[i] < maxDist) {
            value += sv[i];
            count++;
            // }
        }

        if (count == 0) {
            logger.error("getAverageScanValue count is == 0");
            return Double.NaN;
        }

        value = value / (double) count;

        return value;
    }

    /**
     * Getter for an average scanner value over a given angle range.
     *
     * @param angle The angle of the requested value (0° points forward).
     * @param widthAngle The width of the scan window used for average the
     * value.
     * @param au Unit of the angles.
     * @param scannerModel Identity of the used laser scanner.
     * @param lu Unit of the returned length.
     * @return
     * @throws OutOfRangeException Is thrown if the given angle is out of the
     * laser scanners range.
     */
    public double getAverageScanValue(double angle, double widthAngle,
            AngleUnit au, LengthUnit lu)
            throws OutOfRangeException {

        angle = UnitConverter.convert(angle, au, AngleUnit.RADIAN);
        widthAngle = UnitConverter.convert(widthAngle, au, AngleUnit.RADIAN);

        // calculate average window
        double startAngle = angle - widthAngle / 2.0;
        double endAngle = angle + widthAngle / 2.0;
        double rangeRad = scanAngle;

        // make window smaller if it exceeds the laser's range.
        double sideAngle = rangeRad / 2.0;
        if (startAngle < -sideAngle) {
            startAngle = -sideAngle;
        }
        if (endAngle > sideAngle) {
            endAngle = sideAngle;
        }
        
        logger.debug("get average dist between angles: " + startAngle + " and " + endAngle);
        
        int scanNumStart = LaserInfo.calcScanIndex(scanAngle, scanValues.length, startAngle);
        int scanNumEnd = LaserInfo.calcScanIndex(scanAngle, scanValues.length, endAngle);

        logger.debug("get average dist between indices: " + scanNumStart + " and " + scanNumEnd);
        
        // calculate average
        double value = 0;
        int count = 0;
        double maxDist = LaserInfo.getInfo(ScannerModel.SICK_LMS200).getMaxDistance();
        maxDist = UnitConverter.convert(maxDist, iLU, lu);
        double[] sv = getScanValues(lu);
        for (int i = scanNumStart; i <= scanNumEnd; i++) {
            if (Double.isNaN(sv[i]) || Double.isInfinite(sv[i])) {
                logger.error("scan value " + i + " is NaN or Inf");
                continue;
            }
            // if (sv[i] < maxDist) {
            value += sv[i];
            count++;
            // }
        }

        if (count == 0) {
            logger.error("getAverageScanValue count is == 0");
            return Double.NaN;
        }

        value = value / (double) count;

        return value;
    }

    public double getScanAngle(AngleUnit unit) {
        return UnitConverter.convert(scanAngle, iAU, unit);
    }

    public void setScanAngle(double scanAngle, AngleUnit unit) {
        this.scanAngle = UnitConverter.convert(scanAngle, unit, iAU);
    }

    @Override
    public String toString() {
        StringBuilder strb = new StringBuilder();
        strb.append("#LASER# ");
        strb.append("timestamp: " + getTimestamp() + "; ");
        strb.append("num: " + getNumLaserPoints() + "; ");
        strb.append("values:");
        for (double scanValue : scanValues) {
            strb.append(" " + scanValue);
        }
        strb.append(";");
        return strb.toString();
    }

}
