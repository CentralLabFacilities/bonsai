package de.unibi.citec.clf.btl.data.map;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;

import java.util.UUID;

/**
 * Representation of a viewpoint. Each viewpoint has coordinates (x, y, yaw), a
 * prescribed category and a unique label.
 * @author lkettenb
 */
@Deprecated
public class Viewpoint extends Pose2D {

    /**
     * The label of this viewpoint. This label should be unique. Please note
     * that this is not verified until now.
     */
    protected String label = UUID.randomUUID().toString();
    
    /**
     * Default constructor as expected by {@link Type}. You should not use it!
     */
    public Viewpoint() {

    }
    public Viewpoint(Pose2D pose2D){
        super(pose2D);
    }

    public Viewpoint(Pose2D pose2D, String label){
        super(pose2D);
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    @Override
    public boolean equals(Object obj) {
        try {
            if (!(obj instanceof Viewpoint)) {
                return false;
            }

            Viewpoint other = (Viewpoint) obj;

            if (!other.getLabel().equals(getLabel())) {
                return false;
            }
        } catch (Exception e) {
            return false;
        }
        return true;
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 29 * hash + (this.label != null ? this.label.hashCode() : 0);
        return hash;
    }
}
