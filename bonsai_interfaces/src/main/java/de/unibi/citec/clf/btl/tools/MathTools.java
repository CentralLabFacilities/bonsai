package de.unibi.citec.clf.btl.tools;



import javax.vecmath.Matrix3d;
import javax.vecmath.Quat4d;
import javax.vecmath.Vector2d;
import javax.vecmath.Vector3d;

import de.unibi.citec.clf.btl.data.geometry.*;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.PositionData.ReferenceFrame;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import de.unibi.citec.clf.btl.units.UnknownUnitException;

public class MathTools {

    public static class MathException extends IllegalArgumentException {
        private static final long serialVersionUID = 7266399233757052165L;

        public MathException(String msg) {
            super(msg);
        }
    }

    /**
     * Normalize angle to be "-PI < angle <= PI" or "-180° < angle <= 180°"
     * respectively.
     * 
     * @param arbitrary
     *            angle
     * @return normalized angle
     */
    public static double normalizeAngle(double angle, AngleUnit aU) {

        switch (aU) {
        case RADIAN:
            double newAngleRad = angle;
            while (newAngleRad <= -Math.PI)
                newAngleRad += 2 * Math.PI;
            while (newAngleRad > Math.PI)
                newAngleRad -= 2 * Math.PI;
            return newAngleRad;
        case DEGREE:
            double newAngleDeg = angle;
            while (newAngleDeg <= -180.0)
                newAngleDeg += 360.0;
            while (newAngleDeg > 180.0)
                newAngleDeg -= 360.0;
            return newAngleDeg;
        default:
            throw new UnknownUnitException("Can not normalize angle of unit: " + aU);
        }
    }

    public static PositionData localToOther(PositionData global, PositionData other) {
        LengthUnit iLU = LengthUnit.MILLIMETER;
        AngleUnit iAU = AngleUnit.RADIAN;

        double dy = global.getY(iLU) - other.getY(iLU);
        double dx = global.getX(iLU) - other.getX(iLU);
        double angle = global.getYaw(iAU) - other.getYaw(iAU);
        angle = MathTools.normalizeAngle(angle, iAU);

        double dx1 = MathTools.rotatePointX(dx, dy, -other.getYaw(iAU), iAU);
        double dy1 = MathTools.rotatePointY(dx, dy, -other.getYaw(iAU), iAU);

        PositionData out = new PositionData(global);
        out.setFrameId(ReferenceFrame.LOCAL);
        out.setX(dx1, iLU);
        out.setY(dy1, iLU);
        out.setYaw(angle, iAU);
        return out;
    }

    public static PositionData globalToLocal(PositionData global, PositionData robot) {
        if (!global.getFrameId().equals(ReferenceFrame.GLOBAL.getFrameName())) {
            throw new MathException("given point does not have a global reference frame");
        }
        LengthUnit iLU = LengthUnit.MILLIMETER;
        AngleUnit iAU = AngleUnit.RADIAN;

        double dy = global.getY(iLU) - robot.getY(iLU);
        double dx = global.getX(iLU) - robot.getX(iLU);
        double angle = global.getYaw(iAU) - robot.getYaw(iAU);
        angle = MathTools.normalizeAngle(angle, iAU);
        
        double dx1 = MathTools.rotatePointX(dx, dy, -robot.getYaw(iAU), iAU);
        double dy1 = MathTools.rotatePointY(dx, dy, -robot.getYaw(iAU), iAU);

        PositionData out = new PositionData(global);
        out.setFrameId(ReferenceFrame.LOCAL);
        out.setX(dx1, iLU);
        out.setY(dy1, iLU);
        out.setYaw(angle, iAU);
        return out;
    }

    public static PositionData localToGlobal(PositionData local, PositionData robot) {
        if (!local.getFrameId().equals(ReferenceFrame.LOCAL.toString())) {
            throw new MathException("given point does not have a local reference frame");
        }
        LengthUnit iLU = LengthUnit.MILLIMETER;
        AngleUnit iAU = AngleUnit.RADIAN;

        double dy = local.getY(iLU) + robot.getY(iLU);
        double dx = local.getX(iLU) + robot.getX(iLU);
        double angle = local.getYaw(iAU) + robot.getYaw(iAU);
        angle = MathTools.normalizeAngle(angle, iAU);

        PositionData out = new PositionData(local);
        out.setFrameId(ReferenceFrame.GLOBAL);
        out.setX(dx, iLU);
        out.setY(dy, iLU);
        out.setYaw(angle, iAU);
        return out;
    }

    public static double rotatePointX(final double xIn, final double yIn, final double angle, final AngleUnit unit) {
        double theta = UnitConverter.convert(angle, unit, AngleUnit.RADIAN);
        double cs = Math.cos(theta);
        double sn = Math.sin(theta);
        return xIn * cs - yIn * sn;
    }
    
    public static double rotatePointY(final double xIn, final double yIn, final double angle, final AngleUnit unit) {
        double theta = UnitConverter.convert(angle, unit, AngleUnit.RADIAN);
        double cs = Math.cos(theta);
        double sn = Math.sin(theta);
        return xIn * sn + yIn * cs;
    }

    public static Point2D rotatePoint(final Point2D in, final double angle, final AngleUnit unit) {
        double x0 = MathTools.rotatePointX(in.getX(in.getOriginalLU()), in.getY(in.getOriginalLU()), angle, unit);
        double y0 = MathTools.rotatePointY(in.getX(in.getOriginalLU()), in.getY(in.getOriginalLU()), angle, unit);
        Point2D p = new Point2D(in);
        p.setX(x0, in.getOriginalLU());
        p.setY(y0, in.getOriginalLU());
        return p;
    }

    public static PolarCoordinate cartesianToPolar(Point2D cartesian) {
        return new PolarCoordinate(cartesian);
    }

    public static double cartesianToPolarDistance(final double x, final double y) {
        return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
    }
    
    public static double cartesianToPolarAngle(final double x, final double y, AngleUnit angleUnit) {
        double angleOut = Math.atan2(y, x);
        return UnitConverter.convert(angleOut, AngleUnit.RADIAN, angleUnit);
    }

    public static Vector2d polarToCartesian(final double distance, final double angle, 
            AngleUnit angleUnit) {
        double angleRad = UnitConverter.convert(angle, angleUnit, AngleUnit.RADIAN);
        double xOut = Math.cos(angleRad) * distance;
        double yOut = Math.sin(angleRad) * distance;
        return new Vector2d(xOut, yOut);
    }

    /**
     * Epsilon used for different tests.
     */
    public static final double EPS = 0.000001;

    /**
     * Rotation order conventions for Euler angles.
     * 
     * @author jwienke
     */
    public enum RotationOrder {
        YXZ, ZYX, ZXY
    }

    /**
     * Converts a quaternion to Euler angles for a given order of rotations.
     * 
     * Adapted from org.specknet.MotionTracking.Utils.QuatUitls.
     * 
     * @param q
     *            the quaternion to convert
     * @param order
     *            the Euler angle rotation order to use
     * @return array of three elements with the Euler angles
     * @throws IllegalArgumentException
     *             unsupported rotation order requested
     */
    public static double[] getEulerAngles(Quat4d q, RotationOrder order) {
        Matrix3d m = new Matrix3d();
        m.set(q);
        double x, y, z;
        switch (order) {
        case YXZ: {
            double sx = -m.m12;
            if (sx < (1 - EPS)) {
                if (sx > (-1 + EPS)) {
                    x = Math.asin(sx);
                    y = Math.atan2(m.m02, m.m22);
                    z = Math.atan2(m.m10, m.m11);
                } else {
                    x = -Math.PI / 2;
                    y = Math.atan2(-m.m01, m.m00);
                    z = 0;
                }
            } else {
                x = Math.PI / 2;
                y = Math.atan2(m.m01, m.m00);
                z = 0;
            }
            break;
        }
        case ZYX: {
            double sy = -m.m20;
            if (sy < (1 - EPS)) {
                if (sy > (-1 + EPS)) {
                    y = Math.asin(sy);
                    x = Math.atan2(m.m21, m.m22);
                    z = Math.atan2(m.m10, m.m00);
                } else {
                    y = -Math.PI / 2;
                    z = Math.PI - Math.atan2(-m.m01, m.m02);
                    x = 0;
                }
            } else {
                y = Math.PI / 2;
                z = Math.atan2(-m.m01, m.m02);
                x = 0;
            }
            break;
        }
        case ZXY: {
            double sx = m.m21;
            if (sx < (1 - EPS)) {
                if (sx > (-1 + EPS)) {
                    x = Math.asin(sx);
                    z = Math.atan2(-m.m01, m.m11);
                    y = Math.atan2(-m.m20, m.m22);
                } else {
                    x = -Math.PI / 2;
                    y = 0;
                    z = -Math.atan2(m.m02, m.m00);
                }
            } else {
                x = Math.PI / 2;
                y = 0;
                z = Math.atan2(m.m02, m.m00);
            }
            break;
        }
        default:
            throw new IllegalArgumentException("Unsupported");
        }
        return new double[] { z, x, y };
    }
    
    /**
     * Calculate yaw pitch and roll from matrix;
     * @param mat input matrix
     */
    public static Vector3d getYPR(final Matrix3d mat) {

    	// this code is taken from buttel btMatrix3x3 getEulerYPR().
    	// http://bulletphysics.org/Bullet/BulletFull/btMatrix3x3_8h_source.html
		// first use the normal calculus
		double yawOut = Math.atan2(mat.m10, mat.m00);
		double pitchOut = Math.asin(-mat.m20);
		double rollOut = Math.atan2(mat.m21, mat.m22);

		// on pitch = +/-HalfPI
		if (Math.abs(pitchOut) == Math.PI / 2.0) {
			if (yawOut > 0)
				yawOut -= Math.PI;
			else
				yawOut += Math.PI;

			if (pitchOut > 0)
				pitchOut -= Math.PI;
			else
				pitchOut += Math.PI;
		}
		
		return new Vector3d(yawOut, pitchOut, rollOut);
    }

    /**
     * Shortcut function to return the fraction of a rotation described by a
     * quaternion around the Z-axis of the coordinate system.
     * 
     * @param quaternion
     *            rotation to convert
     * @return angle in rad
     */
    public static double zRotationFromQuaternion(final Quat4d quaternion) {
        
        quaternion.normalize();
        Matrix3d mat = new Matrix3d();
        mat.set(quaternion);
        return zRotationFromMatrix(mat);
    }
    
    /**
     * Shortcut function to return the fraction of a rotation described by a
     * rotation matrix around the Z-axis of the coordinate system.
     * 
     * @param mat
     *            rotation to convert
     * @return angle in rad
     */
    public static double zRotationFromMatrix(final Matrix3d mat) {
    	Vector3d ypr = getYPR(mat);
        return ypr.x;
    }
    
    public static Point3D applyRotation(Point3D point, Rotation3D rot) {
    	LengthUnit m = LengthUnit.METER;
    	Vector3d vec = new Vector3d(point.getX(m), point.getY(m), point.getZ(m));
    	rot.getMatrix().transform(vec);
    	return new Point3D(vec.x, vec.y, vec.z, m, point.getFrameId());
    }
    
    public static Point3D applyAddition(Point3D p0, Point3D p1) {
    	LengthUnit m = LengthUnit.METER;
    	return new Point3D(p0.getX(m) + p1.getX(m), p0.getY(m) + p1.getY(m), p0.getZ(m) + p1.getZ(m), m, p0.getFrameId());
    }

    public static Pose3D positionToPose (PositionData position) {
        Point3D point = new Point3D(position.getX(LengthUnit.METER), position.getY(LengthUnit.METER), 0, LengthUnit.METER);
        Rotation3D rotation = new Rotation3D(new Vector3d(0,0,1), position.getYaw(AngleUnit.RADIAN), AngleUnit.RADIAN);
        return new Pose3D(point, rotation, position.getFrameId());
    }
}
