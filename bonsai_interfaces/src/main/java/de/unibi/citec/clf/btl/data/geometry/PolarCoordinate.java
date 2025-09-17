package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

public class PolarCoordinate extends Type {
    // coordinates in millimeters, radians
    protected double distance, angle;
    protected static final LengthUnit iLU = LengthUnit.MILLIMETER;
    protected static final AngleUnit iAU = AngleUnit.RADIAN;

    public PolarCoordinate() {
    }

    public PolarCoordinate(double distance, double angle, LengthUnit distUnit, AngleUnit angleUnit) {
        setDistance(distance, distUnit);
        setAngle(angle, angleUnit);
    }

    public PolarCoordinate(PolarCoordinate p) {
        super(p);
        distance = p.distance;
        angle = p.angle;
    }
    
    public PolarCoordinate(Point2DStamped point) {
        super(point);
        distance = MathTools.cartesianToPolarDistance(point.getX(iLU), point.getY(iLU));
        angle = MathTools.cartesianToPolarAngle(point.getX(iLU), point.getY(iLU), iAU);
    }

    public PolarCoordinate(Pose2D pos) {
        distance = MathTools.cartesianToPolarDistance(pos.getX(iLU), pos.getY(iLU));
        angle = MathTools.cartesianToPolarAngle(pos.getX(iLU), pos.getY(iLU), iAU);
    }

    public double getDistance(LengthUnit unit) {
        return UnitConverter.convert(distance, iLU, unit);
    }

    public final void setDistance(double distance, LengthUnit unit) {
        this.distance = UnitConverter.convert(distance, unit, iLU);
    }

    public double getAngle(AngleUnit unit) {
        return UnitConverter.convert(angle, iAU, unit);
    }

    public final void setAngle(double angle, AngleUnit unit) {
        this.angle = UnitConverter.convert(angle, unit, iAU);
    }

    @Override
    public boolean equals(Object obj) {
        try {
            if (!(obj instanceof PolarCoordinate))
                return false;

            PolarCoordinate other = (PolarCoordinate) obj;

            if (other.getDistance(iLU) != getDistance(iLU))
                return false;
            if (other.getAngle(iAU) != getAngle(iAU))
                return false;

        } catch (Exception e) {
            return false;
        }
        return true;
    }

    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " distance=" + distance + " angle=" + angle + "]";
    }
}
