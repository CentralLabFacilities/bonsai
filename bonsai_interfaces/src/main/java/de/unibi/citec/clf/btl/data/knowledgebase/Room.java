package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class Room extends AreaDescriber {

    private String name;
    private int numberOfDoors;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getNumberOfDoors() {
        return numberOfDoors;
    }

    public void setNumberOfDoors(int numberOfDoors) {
        this.numberOfDoors = numberOfDoors;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Room)) return false;
        if (!super.equals(o)) return false;
        Room room = (Room) o;
        return numberOfDoors == room.numberOfDoors &&
                Objects.equals(name, room.name) &&
                Objects.equals(annotation, room.annotation);
    }

    @Override
    public int hashCode() {
        int hash = 3;
        hash = 79 * hash + Objects.hashCode(this.name);
        hash = 79 * hash + this.numberOfDoors;
        hash = 79 * hash + Objects.hashCode(this.annotation);
        return hash;
    }

    @Override
    public String toString() {
        return "Room: (name: " + this.getName()
                + " numDoors: " + this.getNumberOfDoors()
                //+ " annotation: " + this.annotation.toString()
                + " annotation: " + this.annotation
                + ")";
    }

}
