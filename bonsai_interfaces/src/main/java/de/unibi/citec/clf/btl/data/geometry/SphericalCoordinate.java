package de.unibi.citec.clf.btl.data.geometry;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

public class SphericalCoordinate extends Type {
    // coordinates in millimeters, radians
    protected double distance, azimuth, zenith;
    protected static final LengthUnit iLU = LengthUnit.MILLIMETER;
    protected static final AngleUnit iAU = AngleUnit.RADIAN;

    public SphericalCoordinate() {
    }

    public SphericalCoordinate(double distance, double azimuth,double zenith,  LengthUnit distUnit, AngleUnit angleUnit) {
        setDistance(distance, distUnit);
        setAzimuth(azimuth, angleUnit);
        setZenith(zenith, angleUnit);
    }

    public SphericalCoordinate(SphericalCoordinate p) {
        super(p);
        distance = p.distance;
        azimuth = p.azimuth;
        zenith = p.zenith;
    }

    public double getDistance(LengthUnit unit) {
        return UnitConverter.convert(distance, iLU, unit);
    }

    public void setDistance(double distance, LengthUnit unit) {
        this.distance = UnitConverter.convert(distance, unit, iLU);
    }

    public double getAzimuth(AngleUnit unit) {
        return UnitConverter.convert(azimuth, iAU, unit);
    }

    public void setAzimuth(double angle, AngleUnit unit) {
        this.azimuth = UnitConverter.convert(angle, unit, iAU);
    }

    public double getZenith(AngleUnit unit) {
        return UnitConverter.convert(zenith, iAU, unit);
    }

    public void setZenith(double zenith, AngleUnit unit) {
        this.zenith = UnitConverter.convert(zenith, unit, iAU);
    }

    @Override
    public boolean equals(Object obj) {
        try {
            if (!(obj instanceof SphericalCoordinate))
                return false;

            SphericalCoordinate other = (SphericalCoordinate) obj;

            if (other.getDistance(iLU) != getDistance(iLU))
                return false;
            if (other.getAzimuth(iAU) != getAzimuth(iAU))
                return false;
            if (other.getZenith(iAU) != getZenith(iAU))
                return false;

        } catch (Exception e) {
            return false;
        }
        return true;
    }

    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " distance=" + distance + " azimuth=" + azimuth + " zenith=" + zenith
                + "]";
    }
}
