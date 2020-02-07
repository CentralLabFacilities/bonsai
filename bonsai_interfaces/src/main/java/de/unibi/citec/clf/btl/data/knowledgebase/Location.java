package de.unibi.citec.clf.btl.data.knowledgebase;

import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class Location extends AreaDescriber {

    private String name;
    private String room;
    private boolean isBeacon;
    private boolean isPlacement;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRoom() {
        return room;
    }

    public void setRoom(String room) {
        this.room = room;
    }

    public boolean isBeacon() {
        return isBeacon;
    }

    public void setIsBeacon(boolean isBeacon) {
        this.isBeacon = isBeacon;
    }

    public boolean isPlacement() {
        return isPlacement;
    }

    public void setIsPlacement(boolean isPlacement) {
        this.isPlacement = isPlacement;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Location)) return false;
        if (!super.equals(o)) return false;
        Location location = (Location) o;
        return isBeacon == location.isBeacon &&
                isPlacement == location.isPlacement &&
                Objects.equals(name, location.name) &&
                Objects.equals(room, location.room) &&
                Objects.equals(annotation, location.annotation);
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 59 * hash + Objects.hashCode(this.name);
        hash = 59 * hash + Objects.hashCode(this.room);
        hash = 59 * hash + (this.isBeacon ? 1 : 0);
        hash = 59 * hash + (this.isPlacement ? 1 : 0);
        hash = 59 * hash + Objects.hashCode(this.annotation);
        return hash;
    }

    @Override
    public String toString() {
        return "Loc: name: " + this.getName()
                + "; room: " + this.getRoom()
                + "; Annotation" + this.getAnnotation();
    }
}
