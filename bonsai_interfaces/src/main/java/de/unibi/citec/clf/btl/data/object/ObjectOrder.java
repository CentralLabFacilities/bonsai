package de.unibi.citec.clf.btl.data.object;


import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.map.Viewpoint;

/**
 * This class is used to store an objectName with the orderer of it.
 *
 *
 * @author vlosing, alangfeld, lziegler
 */
@Deprecated
public class ObjectOrder extends Type {

    private int ordererFaceClassId = -1;

    
    private String objectName = "";
    private String ordererName = "";
    private String category = "";
    private Viewpoint targetLocation = null;

    public int getOrdererFaceClassId() {
        return ordererFaceClassId;
    }

    public void setOrdererFaceClassId(int ordererFaceClassId) {
        this.ordererFaceClassId = ordererFaceClassId;
    }
    
    /**
     * @return ojbectName
     */
    public String getObjectName() {
        return objectName;
    }

    /**
     * @return orderName
     */
    public String getOrdererName() {
        return ordererName;
    }

    /**
     * Sets the object name.
     *
     * @param objectName name of object
     */
    public void setObjectName(String objectName) {
        this.objectName = objectName;
    }

    /**
     * Sets the object name.
     *
     * @param objectName name of object
     */
    public void setOrdererName(String ordererName) {
        this.ordererName = ordererName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Viewpoint getTargetLocation() {
        return targetLocation;
    }

    public void setTargetLocation(Viewpoint targetLocation) {
        this.targetLocation = targetLocation;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        StringBuilder strb = new StringBuilder();
        strb.append("#ObjectOrder# ");
        strb.append("objectName: " + getObjectName() + "; ");
        strb.append("category: " + getCategory() + "; ");
        strb.append("ordererName: " + getOrdererName() + "; ");
        strb.append("targetLocation: " + getTargetLocation() + "; ");
        return strb.toString();
    }

}
