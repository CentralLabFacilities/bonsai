package de.unibi.citec.clf.bonsai.util;



import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * Utility class with methods to convert between several coordinate systems.
 */
public class CoordinateSystemConverter {

    /**
     * Generate global carthesian coordinates suitable as a navigation goal for
     * the NavigationActuator from local polar coordinate system coordinates
     * given as distance and angle. This method requires the current global
     * position of the robot obtained from the OdometrySensor.
     * 
     * 
     * @param origin
     *            global position of the robot as recently obtained from an
     *            OdometrySensor
     * @param angle
     *            angle of the polar coordinates. An angle=0 corresponds to a
     *            position directly in front of the robot. angles are defined
     *            counter-clockwise.
     * @param dist
     *            distance of polar coordinates (always >0).
     * @param angleUnit
     *            unit of angle.
     * @param lengthUnit
     *            unit of dist.
     * @return the global carthesian position in metres and the corresponding
     *         orientation of the robot as NavigationGoalData, which can
     *         directly by used for the NavigationActuator.
     */
    public static NavigationGoalData polar2NavigationGoalData(PositionData origin, double angle, double dist,
            AngleUnit angleUnit, LengthUnit lengthUnit) {
        NavigationGoalData cart = new NavigationGoalData();
        double localAngle = UnitConverter.convert(angle, angleUnit, AngleUnit.RADIAN)
                + origin.getYaw(AngleUnit.RADIAN);

        localAngle = MathTools.normalizeAngle(localAngle, AngleUnit.RADIAN);

        cart.setX(
                origin.getX(LengthUnit.METER) + Math.cos(localAngle)
                        * UnitConverter.convert(dist, lengthUnit, LengthUnit.METER), LengthUnit.METER);

        cart.setY(
                origin.getY(LengthUnit.METER) + Math.sin(localAngle)
                        * UnitConverter.convert(dist, lengthUnit, LengthUnit.METER), LengthUnit.METER);
        cart.setYaw(localAngle, AngleUnit.RADIAN);
        cart.setFrameId(PositionData.ReferenceFrame.GLOBAL);
        return cart;
    }

    /**
     * Generate local carthesian coordinates suitable as a navigation goal for
     * the NavigationActuator from local polar coordinate system coordinates
     * given as distance and angle. This method requires the current global
     * position of the robot obtained from the OdometrySensor.
     * 
     *
     * @param angle
     *            angle of the polar coordinates. An angle=0 corresponds to a
     *            position directly in front of the robot. angles are defined
     *            counter-clockwise.
     * @param dist
     *            distance of polar coordinates (always >0).
     * @param angleUnit
     *            unit of angle.
     * @param lengthUnit
     *            unit of dist.
     * @return the global carthesian position in metres and the corresponding
     *         orientation of the robot as NavigationGoalData, which can
     *         directly by used for the NavigationActuator.
     */
    public static NavigationGoalData polar2LocalNavigationGoalData(double angle, double dist, AngleUnit angleUnit,
            LengthUnit lengthUnit) {

        PositionData localPosition = new PositionData();
        localPosition.setX(0.0, lengthUnit);
        localPosition.setY(0.0, lengthUnit);
        localPosition.setYaw(0.0, angleUnit);

        NavigationGoalData cart = polar2NavigationGoalData(localPosition, angle, dist, angleUnit, lengthUnit);
        cart.setFrameId(PositionData.ReferenceFrame.LOCAL);

        return cart;
    }

    public static double positionData2Angle(PositionData ownPosition, PositionData oP, AngleUnit angleUnit) {

        return positionData2Angle(ownPosition, new Point2D(oP.getX(LengthUnit.METER), oP.getY(LengthUnit.METER),
                LengthUnit.METER), angleUnit);
    }

    public static double positionData2Angle(PositionData ownPosition, Point2D objectPosition, AngleUnit angleUnit) {

        double angle = Math.atan2(objectPosition.getY(LengthUnit.METER) - ownPosition.getY(LengthUnit.METER),
                objectPosition.getX(LengthUnit.METER) - ownPosition.getX(LengthUnit.METER));

        angle -= ownPosition.getYaw(AngleUnit.RADIAN);
        angle = MathTools.normalizeAngle(angle, AngleUnit.RADIAN);

        return UnitConverter.convert(angle, AngleUnit.RADIAN, angleUnit);
    }

    public static double positionDistance(PositionData ownPosition, PositionData oP, LengthUnit lUnit) {

        return positionDistance(ownPosition, new Point2D(oP.getX(lUnit), oP.getY(lUnit), lUnit), lUnit);
    }

    public static double positionDistance(PositionData ownPosition, Point2D objectPosition, LengthUnit lUnit) {

        double x = ownPosition.getX(lUnit) - objectPosition.getX(lUnit);

        double y = ownPosition.getY(lUnit) - objectPosition.getY(lUnit);

        double dist = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));

        return dist;
    }

    public static PositionData localToGlobal(PositionData src, PositionData currentPosition) {

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        Point2D pGlobal = localToGlobal((Point2D) src, currentPosition);

        double gyaw = currentPosition.getYaw(rad) + src.getYaw(rad);

        PositionData tgt = new PositionData(pGlobal.getX(meter), pGlobal.getY(meter), gyaw, src.getTimestamp(), meter,
                rad);
        return tgt;
    }
    
      public static PositionData armToRobotLocal(Point3D src) {

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;
                
        PositionData tgt = new PositionData(
                src.getZ(meter)+0.20, -src.getY(meter), 0, src.getTimestamp(), meter,
                rad);
        
        return tgt;
    }

    public static Point2D localToGlobal(Point2D src, PositionData currentPosition) {

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        double x = src.getX(meter);
        double y = src.getY(meter);

        // rotate the src point into the global cs
        double cs = Math.cos(currentPosition.getYaw(rad));
        double sn = Math.sin(currentPosition.getYaw(rad));
        double px = x * cs - y * sn;
        double py = x * sn + y * cs;

        // translate into the global cs
        double gx = currentPosition.getX(meter) + px;
        double gy = currentPosition.getY(meter) + py;

        Point2D tgt = new Point2D(gx, gy, meter);
        tgt.setTimestamp(src.getTimestamp());
        return tgt;
    }

    public static PositionData globalToLocal(PositionData src, PositionData referencePosition) {

        Point2D pointLocal = globalToLocal((Point2D) src, referencePosition);

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        double yawLocal = src.getYaw(rad) - referencePosition.getYaw(rad);

        PositionData tgt = new PositionData(pointLocal.getX(meter), pointLocal.getY(meter), yawLocal,
                src.getTimestamp(), meter, rad);
        return tgt;
    }

    public static Point2D globalToLocal(Point2D src, PositionData referencePosition) {

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        double xGlobal = src.getX(meter);
        double yGlobal = src.getY(meter);

        // translate to local
        double xTmp = xGlobal - referencePosition.getX(meter);
        double yTmp = yGlobal - referencePosition.getY(meter);

        // rotate in local
        double cs = Math.cos(-referencePosition.getYaw(rad));
        double sn = Math.sin(-referencePosition.getYaw(rad));
        double xLocal = xTmp * cs - yTmp * sn;
        double yLocal = xTmp * sn + yTmp * cs;

        Point2D p = new Point2D(xLocal, yLocal, meter);
        p.setTimestamp(src.getTimestamp());
        return p;
    }
}
