package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import java.util.Objects;
import org.apache.log4j.Logger;

/**
 * This class represents an angular velocity in space by all 3 dimensions.
 *
 * @author saschroeder
 */
public class AngularVelocity3D  extends Type {

    private final Logger logger = Logger.getLogger(AngularVelocity3D.class);

    private double x;
    private double y;
    private double z;

    private RotationalSpeedUnit iSU;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AngularVelocity3D)) return false;
        if (!super.equals(o)) return false;
        AngularVelocity3D vel3D = (AngularVelocity3D) o;
        return Double.compare(vel3D.x, x) == 0 &&
                Double.compare(vel3D.y, y) == 0 &&
                Double.compare(vel3D.z, z) == 0 &&
                iSU == vel3D.iSU;
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.x) ^ (Double.doubleToLongBits(this.x) >>> 32));
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.y) ^ (Double.doubleToLongBits(this.y) >>> 32));
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.z) ^ (Double.doubleToLongBits(this.z) >>> 32));
        return hash;
    }

    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " x=" + x + " y=" + y + " z=" + z + "]";
    }

    /**
     * Creates instance.
     */
    public AngularVelocity3D() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.iSU = RotationalSpeedUnit.RADIANS_PER_SEC;
    }

    public AngularVelocity3D(AngularVelocity3D v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        this.iSU = v.iSU;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param z third value
     * @param unit unit of the values
     */
    public AngularVelocity3D(double x, double y, double z, RotationalSpeedUnit unit) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.iSU = unit;
    }

    public AngularVelocity3D(double x, double y, double z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public double getX(RotationalSpeedUnit unit) {
        return UnitConverter.convert(x, this.iSU, unit);
    }

    public void setX(double x, RotationalSpeedUnit unit) {
        this.x = UnitConverter.convert(x, unit, this.iSU);
    }

    public double getY(RotationalSpeedUnit unit) {
        return UnitConverter.convert(y, this.iSU, unit);
    }

    public void setY(double y, RotationalSpeedUnit unit) {
        this.y = UnitConverter.convert(y, unit, this.iSU);
    }

    public double getZ(RotationalSpeedUnit unit) {
        return UnitConverter.convert(z, this.iSU, unit);
    }

    public void setZ(double z, RotationalSpeedUnit unit) {
        this.z = UnitConverter.convert(z, unit, this.iSU);
    }

    public RotationalSpeedUnit getiSU() {
        return this.iSU;
    }

    public void setiSU(RotationalSpeedUnit iSU) {
        this.iSU = this.iSU;
    }
}
