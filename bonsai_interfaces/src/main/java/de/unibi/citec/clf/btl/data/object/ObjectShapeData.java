package de.unibi.citec.clf.btl.data.object;


import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import java.util.HashSet;
import java.util.Set;

import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * Results of the object recognition. This class is meat so define the location
 * of the object in the detector's camera image and contain shape information in
 * 3D! The given polygon describes the objects's location in pixel coordinates!
 *
 * @author lziegler
 */
public class ObjectShapeData extends ObjectData {

    private BoundingBox3D bb;
    private String id = "-1";

    public BoundingBox3D getBoundingBox() {
        return this.bb;
    }

    public void setBoundingBox(BoundingBox3D bb){
        this.bb = bb;
    }

    public void setBoundingBox(Pose3D pose, double height, double width, double depth){
        Point3D size = new Point3D(height, width, depth, LengthUnit.MILLIMETER);
        this.bb = new BoundingBox3D(pose, size);
    }

    public double getEpsilonToOtherObject(ObjectShapeData other) {
        double eps = Double.MAX_VALUE;

        if (other != null) {
            eps = 0;
            eps += (other.getBoundingBox().getPose().getTranslation().distance(this.getBoundingBox().getPose().getTranslation()));
            eps += Math.abs(this.getBoundingBox().getSize().getX(LengthUnit.MILLIMETER) - other.getBoundingBox().getSize().getX(LengthUnit.MILLIMETER));
            eps += Math.abs(this.getBoundingBox().getSize().getY(LengthUnit.MILLIMETER) - other.getBoundingBox().getSize().getY(LengthUnit.MILLIMETER));
            eps += Math.abs(this.getBoundingBox().getSize().getZ(LengthUnit.MILLIMETER) - other.getBoundingBox().getSize().getZ(LengthUnit.MILLIMETER));
        }

        return eps;
    }

    public ObjectShapeData(ObjectShapeData osd) {
        super(osd);
        this.setBoundingBox(osd.getBoundingBox());
        this.id = osd.id;
        hypotheses.clear();
        for (Hypothesis h : osd.getHypotheses()) {
            addHypothesis(new Hypothesis(h));
        }
    }

    public ObjectShapeData(ObjectData od) {
        super(od);
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Point3D getCenter() {
        return bb.getPose().getTranslation();
    }

    public double getHeight(LengthUnit unit) {
        return bb.getSize().getX(unit);
    }
    

    public double getWidth(LengthUnit unit) {
        return bb.getSize().getY(unit);
    }

    public double getDepth(LengthUnit unit) {
        return bb.getSize().getZ(unit);
    }

    public ObjectShapeData() {
    }

    @Override
    public String toString() {
        final StringBuilder sb = new StringBuilder("ObjectShapeData{");
        sb.append("bb=").append(bb);
        sb.append(", id='").append(id).append('\'');
        sb.append(", hypotheses=").append(hypotheses);
        sb.append(", timestamp=").append(timestamp);
        sb.append(", frameId='").append(frameId).append('\'');
        sb.append('}');
        return sb.toString();
    }
}
