
package de.unibi.citec.clf.btl.data.object;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.navigation.PositionData;


/**
 *
 * @author semueller
 */
public class ObjectSetTable extends Type{
    
    
    private String name = "";
    private int graspDifficulty=  -1;
    //private String current_location_annotation= "";
    private boolean moved = false;
    //private Viewpoint current_location = null;
    private PositionData originalLocation = null;
    private PositionData currentLocation = null;

    public ObjectSetTable(){
        this.name = "default";
        this.originalLocation = new PositionData();
        this.currentLocation = new PositionData();
        this.graspDifficulty = -1;
        this.moved = false;
    }
    
    public ObjectSetTable(String name, PositionData originalLocation, int graspability){
        this.name = name;
        this.originalLocation = originalLocation;
        this.currentLocation = originalLocation;
        this.graspDifficulty = graspability;
    }
    
    public int getGraspDifficulty() {
        return graspDifficulty;
    }

    public void setGraspDifficulty(int graspability) {
        this.graspDifficulty = graspability;
    }
    
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isMoved() {
        return moved;
    }

    public void setMoved(boolean moved) {
        this.moved = moved;
    }

    public PositionData getOriginalLocation() {
        return originalLocation;
    }

    public void setOriginalLocation(PositionData original_location) {
        if(original_location != null){
        this.originalLocation = original_location;
            return;
        }
    }
    public PositionData getCurrentLocation(){
        return currentLocation;
    }
    public void setCurrentLocation(PositionData newLocation){
        if(newLocation != null){
        this.currentLocation = newLocation;
            return;
        }
    }

    /**
     * currently only toStrings Viewpoint for Location
     * @return 
     */
    @Override
    public String toString() {
        StringBuilder strb = new StringBuilder();
        strb.append("#ObjectSetTable# ");
        strb.append("name: " + getName() + "; ");
        strb.append("originalLocation: " + getOriginalLocation().toString() + "; ");
        strb.append("originalLocation: " + getCurrentLocation().toString() + "; ");
        strb.append("moved: " + isMoved() + "; ");
        strb.append("graspability: " + getGraspDifficulty() + "; ");
        return strb.toString();
    }
}
