package de.unibi.citec.clf.bonsai.util;



import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Point2DStamped;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

import static de.unibi.citec.clf.btl.StampedType.LOCAL_FRAME;
import static de.unibi.citec.clf.btl.StampedType.GLOBAL_FRAME;

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
    public static NavigationGoalData polar2NavigationGoalData(Pose2D origin, double angle, double dist,
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
        cart.setFrameId(Pose2D.ReferenceFrame.GLOBAL);
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

        Pose2D localPosition = new Pose2D();
        localPosition.setX(0.0, lengthUnit);
        localPosition.setY(0.0, lengthUnit);
        localPosition.setYaw(0.0, angleUnit);

        NavigationGoalData cart = polar2NavigationGoalData(localPosition, angle, dist, angleUnit, lengthUnit);
        cart.setFrameId(Pose2D.ReferenceFrame.LOCAL);

        return cart;
    }

    public static double positionData2Angle(Pose2D ownPosition, Pose2D oP, AngleUnit angleUnit) {

        return positionData2Angle(ownPosition, new Point2D(oP.getX(LengthUnit.METER), oP.getY(LengthUnit.METER),
                LengthUnit.METER), angleUnit);
    }

    public static double positionData2Angle(Pose2D ownPosition, Point2D objectPosition, AngleUnit angleUnit) {

        double angle = Math.atan2(objectPosition.getY(LengthUnit.METER) - ownPosition.getY(LengthUnit.METER),
                objectPosition.getX(LengthUnit.METER) - ownPosition.getX(LengthUnit.METER));

        angle -= ownPosition.getYaw(AngleUnit.RADIAN);
        angle = MathTools.normalizeAngle(angle, AngleUnit.RADIAN);

        return UnitConverter.convert(angle, AngleUnit.RADIAN, angleUnit);
    }

    public static double positionDistance(Pose2D ownPosition, Pose2D oP, LengthUnit lUnit) {

        return positionDistance(ownPosition, new Point2D(oP.getX(lUnit), oP.getY(lUnit), lUnit), lUnit);
    }

    public static double positionDistance(Pose2D ownPosition, Point2D objectPosition, LengthUnit lUnit) {

        double x = ownPosition.getX(lUnit) - objectPosition.getX(lUnit);

        double y = ownPosition.getY(lUnit) - objectPosition.getY(lUnit);

        double dist = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));

        return dist;
    }

    @Deprecated
    public static Pose2D localToGlobal(Pose2D src, Pose2D currentPosition) {

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        Point2DStamped pGlobal = localToGlobal((Point2DStamped) src, currentPosition);

        double gyaw = currentPosition.getYaw(rad) + src.getYaw(rad);

        Pose2D tgt = new Pose2D(pGlobal.getX(meter), pGlobal.getY(meter), gyaw, src.getTimestamp(), meter,
                rad);
        return tgt;
    }

    public static Point2DStamped localToGlobal(Point2DStamped src, Pose2D currentPosition) {

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

        Point2DStamped tgt = new Point2DStamped(gx, gy, meter, GLOBAL_FRAME);
        tgt.setTimestamp(src.getTimestamp());
        return tgt;
    }

    public static Pose2D globalToLocal(Pose2D src, Pose2D referencePosition) {

        Point2DStamped pointLocal = globalToLocal((Point2DStamped) src, referencePosition);

        LengthUnit meter = LengthUnit.METER;
        AngleUnit rad = AngleUnit.RADIAN;

        double yawLocal = src.getYaw(rad) - referencePosition.getYaw(rad);

        Pose2D tgt = new Pose2D(pointLocal.getX(meter), pointLocal.getY(meter), yawLocal,
                src.getTimestamp(), meter, rad);
        tgt.setFrameId(LOCAL_FRAME);
        return tgt;
    }

    public static Point2DStamped globalToLocal(Point2DStamped src, Pose2D referencePosition) {

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

        Point2DStamped p = new Point2DStamped(xLocal, yLocal, meter, GLOBAL_FRAME);
        p.setTimestamp(src.getTimestamp());
        return p;
    }
}
