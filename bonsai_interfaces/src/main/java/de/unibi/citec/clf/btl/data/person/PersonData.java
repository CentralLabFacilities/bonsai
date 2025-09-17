package de.unibi.citec.clf.btl.data.person;


import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Point3DStamped;
import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.data.geometry.Pose2D;

/**
 *
 * @author rfeldhans
 *
 */
public class PersonData extends StampedType {

    private double reliability = 0.0;
    private String uuid;
    private String name = "";
    private Point3D headPosition;
    private Point3D rightHandPosition;
    private Point3D leftHandPosition;
    private Double estimate_angle;
    protected PersonAttribute attributes = new PersonAttribute();

    private Pose2D position = new Pose2D();

    private static Logger logger = Logger.getLogger(PersonData.class);

    public PersonData() {

    }

    @Override
    public String getFrameId() {
        return getPosition().getFrameId();
    }

    @Override
    public boolean isInBaseFrame() {
        return getPosition().isInBaseFrame();
    }

    @Override
    public void setFrameId(String frame) {
        getPosition().setFrameId(frame);
    }

    public double getReliability() {return reliability;}
    public void setReliability(double rel) {
        if(rel < 0) reliability = 0;
        else if(rel > 1.0) reliability = 1;
        else reliability = rel;
    }

    public String getName() {
        return name;
    }
    public void setName(String name) {
        this.name = name;
    }

    public Point3DStamped getHeadPosition(){
        return new Point3DStamped(headPosition, frameId);
    }
    public void setHeadPosition(Point3D headPosition){
        this.headPosition = headPosition;
    }

    public Point3DStamped getRightHandPosition(){
        return new Point3DStamped(rightHandPosition, frameId);
    }
    public void setRightHandPosition(Point3D rightHandPosition){
        this.rightHandPosition = rightHandPosition;
    }

    public Point3DStamped getLeftHandPosition(){
        return new Point3DStamped(leftHandPosition, frameId);
    }
    public void setLeftHandPosition(Point3D leftHandPosition){
        this.leftHandPosition = leftHandPosition;
    }

    public void setPersonAttribute(PersonAttribute attributes) {
        this.attributes = attributes;
    }
    public PersonAttribute getPersonAttribute() {
        return this.attributes;
    }

    public double getEstimateAngle() {return estimate_angle; }
    public void setEstimateAngle(Double estimate_angle){this.estimate_angle=estimate_angle;}

    /**
     * A setter for the global position of a person. This is the position where
     * the robot has seen this person last
     * @param pose2D global position of a person
     */
    public void setPosition(Pose2D pose2D) {
        position = pose2D;
    }
    public Pose2D getPosition() {
        return position;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }
    public String getUuid() {
        return uuid;
    }

    @Override
    public String toString() {
        StringBuilder strb = new StringBuilder();
        strb.append("#PERSON# ");
        strb.append("uuid: " + uuid + "; ");
        strb.append("timestamp: " + getTimestamp() + "; ");
        strb.append("name: \"" + name + "\"; ");
        if (attributes.getGestures() != null) {
            strb.append("gestures: [\"");
            String prefix = "";
            for(PersonAttribute.Gesture g: attributes.getGestures()){
                strb.append(prefix);
                prefix = ", ";
                strb.append(g.getGestureName());
            }
            strb.append("\"]; ");
        }
        if (attributes.getPosture() != null) {
            strb.append("posture: \"" + attributes.getPosture().getPostureName()+"\"; ");
        }
        if (attributes.getShirtcolor() != null) {
            strb.append("shirt color: \""+attributes.getShirtcolor().getColorName()+"\"; ");
        }
        if (attributes.getAge() != null) {
            strb.append("age: \""+attributes.getAge()+"\"; ");
        }
        if (attributes.getGender() != null) {
            strb.append("gender: \""+attributes.getGender().getGenderName()+"\"; ");
        }
        if (position != null) {
            strb.append(position.toString());
        } else {
            strb.append("position: null");
        }
        return strb.toString();
    }

}
