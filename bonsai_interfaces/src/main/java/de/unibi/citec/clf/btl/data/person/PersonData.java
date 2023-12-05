package de.unibi.citec.clf.btl.data.person;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.knowledgebase.BDO;
import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.data.navigation.PositionData;

/**
 *
 * @author rfeldhans
 *
 */
public class PersonData extends BDO {

    private double reliability = 0.0;
    private String uuid;
    private String name = "";
    private Point3D headPosition;
    private Point3D rightHandPosition;
    private Point3D leftHandPosition;
    private Double estimate_angle;
    protected PersonAttribute attributes = new PersonAttribute();

    private PositionData position = new PositionData();

    private static Logger logger = Logger.getLogger(PersonData.class);

    public PersonData() {

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

    public Point3D getHeadPosition(){
        return headPosition;
    }
    public void setHeadPosition(Point3D headPosition){
        this.headPosition = headPosition;
    }

    public Point3D getRightHandPosition(){
        return rightHandPosition;
    }
    public void setRightHandPosition(Point3D rightHandPosition){
        this.rightHandPosition = rightHandPosition;
    }

    public Point3D getLeftHandPosition(){
        return leftHandPosition;
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
     * @param positionData global position of a person
     */
    public void setPosition(PositionData positionData) {
        position = positionData;
    }
    public PositionData getPosition() {
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
            strb.append("]\"; ");
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
