package de.unibi.citec.clf.bonsai.sensors.data;



public class GripperData {

    private double x;
    private double y;
    private double z;
    private PositionStatus status;

    public enum PositionStatus {
        REACHABLE, NOT_REACHABLE
    }

    public GripperData(double x, double y, double z, PositionStatus status) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.status = status;
    }

    public PositionStatus getStatus() {
        return status;
    }

    public void setStatus(PositionStatus status) {
        this.status = status;
    }

    public double getX() {
        return x;
    }

    public void setX(double x) {
        this.x = x;
    }

    public double getY() {
        return y;
    }

    public void setY(double y) {
        this.y = y;
    }

    public double getZ() {
        return z;
    }

    public void setZ(double z) {
        this.z = z;
    }

}
