package de.unibi.citec.clf.btl.data.status;

import de.unibi.citec.clf.btl.Type;

import java.util.Objects;

public class BatteryState extends Type {

    private float charge;
    private boolean isCharging;
    private float percentage;

    public BatteryState() {};

    public BatteryState(float charge, boolean charging) {
        this.charge = charge;
        this.isCharging = charging;
    }

    public float getCharge() {
        return charge;
    }

    public void setCharge(float charge) {
        this.charge = charge;
    }

    public boolean isCharging() {
        return isCharging;
    }

    public void setCharging(boolean charging) {
        isCharging = charging;
    }

    public float getPercentage() {
        return percentage;

    }

    public void setPercentage(float percentage) {
        this.percentage = percentage;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        BatteryState that = (BatteryState) o;
        return Float.compare(that.charge, charge) == 0 &&
                isCharging == that.isCharging &&
                Float.compare(that.percentage, percentage) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), charge, isCharging, percentage);
    }

    @Override
    public String toString() {
        return "BatteryState{" +
                "charge=" + charge +
                ", isCharging=" + isCharging +
                ", percentage=" + percentage +
                '}';
    }
}
