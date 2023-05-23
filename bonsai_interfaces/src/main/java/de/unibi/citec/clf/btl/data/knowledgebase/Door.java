package de.unibi.citec.clf.btl.data.knowledgebase;

import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
@Deprecated
public class Door extends AreaDescriber {

    private String roomOne;
    private String roomTwo;

    public String getRoomOne() {
        return roomOne;
    }

    public void setRoomOne(String roomOne) {
        this.roomOne = roomOne;
    }

    public String getRoomTwo() {
        return roomTwo;
    }

    public void setRoomTwo(String roomTwo) {
        this.roomTwo = roomTwo;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Door)) return false;
        if (!super.equals(o)) return false;
        Door door = (Door) o;
        return Objects.equals(roomOne, door.roomOne) &&
                Objects.equals(roomTwo, door.roomTwo) &&
                Objects.equals(annotation, door.annotation);
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 71 * hash + Objects.hashCode(this.roomOne);
        hash = 71 * hash + Objects.hashCode(this.roomTwo);
        hash = 71 * hash + Objects.hashCode(this.annotation);
        return hash;
    }

    @Override
    public String toString() {
        return "[Door between " + this.getRoomOne()
                + " and " + this.getRoomTwo()
                //+ " : annotation: " + this.annotation.toString()
                + " : annotation: " + this.annotation
                + "]";
    }

}
