package de.unibi.citec.clf.btl.data.geometry;


import de.unibi.citec.clf.btl.Type;
import java.util.Objects;

public class Twist3D extends Type {

    private Velocity3D linear;
    private AngularVelocity3D angular;

    /**
     * Creates a new instance.
     */
    public Twist3D() {
        super();
    }

    /**
     * Creates a new instance.
     *
     * @param linear
     *            The linear velocity
     * @param angular
     *            The angular velocity
     */
    public Twist3D(Velocity3D linear, AngularVelocity3D angular) {
        super();
        this.linear = linear;
        this.angular = angular;
    }

    public Velocity3D getLinear() {
        return linear;
    }

    public void setLinear(Velocity3D linear) {
        this.linear = linear;
    }

    public AngularVelocity3D getAngular() {
        return angular;
    }

    public void setAngular(AngularVelocity3D angular) {
        this.angular = angular;
    }

    @Override
    public int hashCode() {

        return Objects.hash(super.hashCode(), linear, angular);
    }

    @Override
    public boolean equals(Object obj) {
        if (obj instanceof Twist3D) {
            Twist3D other = (Twist3D) obj;
            return linear.equals(other.linear)
                    && angular.equals(other.angular);
        }
        return false;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp()
                + " Linear velocity: " + linear + " Angular velocity: " + angular + "]";

    }
}
