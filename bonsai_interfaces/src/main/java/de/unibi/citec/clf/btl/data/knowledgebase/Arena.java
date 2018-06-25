package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import java.util.LinkedList;
import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class Arena extends Type {

    private LinkedList<Room> rooms;
    private LinkedList<Location> locations;
    private LinkedList<Door> doors;

    public LinkedList<Door> getDoors() {
        return doors;
    }

    public void setDoors(LinkedList<Door> doors) {
        this.doors = doors;
    }

    public LinkedList<Room> getRooms() {
        return rooms;
    }

    public void setRooms(LinkedList<Room> rooms) {
        this.rooms = rooms;
    }

    public LinkedList<Location> getLocations() {
        return locations;
    }

    public void setLocations(LinkedList<Location> locations) {
        this.locations = locations;
    }

    /**
     * Returns how many of a specific location are in a room. Eg.
     * getNumberOfLocationInRoom("chair", "dining room") will return how many
     * chairs are in the dining room.
     *
     * @param location the location
     * @param room
     * @return
     */
    public int getNumberOfLocationInRoom(String location, String room) {
        int number = 0;
        for (Location loc : locations) {
            if (loc.getName().equals(location) && (loc.getRoom().equals(room)
                    || loc.getRoom().equals(room.replaceAll("room", " room")))) {
                number++;
            }
        }
        return number;
    }

    public String getRoomOfLocation(String location) {
        for (Location loc : locations) {
            if (loc.getName().equals(location)) {
                return loc.getRoom();
            }
        }
        return "unknown room";
    }

    public Room getSpecificRoom(String name) {
        for (Room rm : rooms) {
            if (rm.getName().equals(name) || rm.getName().equals(name.replaceAll("room", " room"))) {
                return rm;
            }
        }
        return null;
    }
    
    /**
     * Gets all the doors one room has.
     * @param room the name of the room of which the doors shall be returned
     * @return a list of the doors
     */
    public LinkedList<Door> getDoorsOfRoom(String room){
        LinkedList<Door> doorsLoc = new LinkedList();
        for(Door door : this.doors){
            if(door.getRoomOne().equals(room) || door.getRoomTwo().equals(room) || door.getRoomOne().equals(room.replaceAll("room", " room")) || door.getRoomTwo().equals(room.replaceAll("room", " room")))
                doorsLoc.add(door);
        }
        return doorsLoc;
    }

    /**
     * Returns in which room a specified Point lies. Can be used with the
     * current robot position to get the room the robot is currently in.
     *
     * @param p the point to which the room shall be retrieved
     * @return the name of the room in which this point lies in (as it is stored
     * in this database). If the point lies in no room, "outside the arena" will
     * be returned.
     */
    public String getCurrentRoom(Point2D p) {
        for (Room rm : rooms) {
            if (rm.isIn(p)) {
                return rm.getName();
            }
        }
        return "outside the arena";
    }

    /**
     * Returns in which location a specified Point lies. Can be used with the
     * current robot position to get the location the robot is currently in.
     *
     * @param p the point to which the location shall be retrieved
     * @return the name of the location in which this point lies in (as it is
     * stored in this database). If the point lies in no location, "not at any
     * location" will be returned.
     */
    public String getCurrentLocation(Point2D p) {
        for (Location loc : locations) {
            if (loc.isIn(p)) {
                return loc.getName();
            }
        }
        return "not at any location";
    }
    
    /**
     * Returns the location a specified Point is nearest to. Can be used with the
     * current robot position to get the location the robot is nearest to.
     *
     * @param p the point to which the nearest location shall be retrieved
     * @return the name of the location in which this point lies in (as it is
     * stored in this database). If the point lies in no location, "not at any
     * location" will be returned.
     */
    public Location getNearestLocation(Point2D p) {
        Location ret = locations.getFirst();
        for (Location loc : locations) {
            if(loc.getAnnotation().getPolygon().contains(p)){
                return loc;
            }
            if (loc.getAnnotation().getPolygon().getDistance(p) < ret.getAnnotation().getPolygon().getDistance(p)) {
                ret = loc;
            }
        }
        return ret;
    }

    public Location getSpecificLocation(String name) {
        for (Location loc : locations) {
            if (loc.getName().equals(name)) {
                return loc;
            }
        }
        return null;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Arena)) return false;
        if (!super.equals(o)) return false;
        Arena arena = (Arena) o;
        return com.google.common.base.Objects.equal(rooms, arena.rooms) &&
                com.google.common.base.Objects.equal(locations, arena.locations) &&
                com.google.common.base.Objects.equal(doors, arena.doors);
    }

    @Override
    public int hashCode() {
        int hash = 3;
        hash = 61 * hash + Objects.hashCode(this.rooms);
        hash = 61 * hash + Objects.hashCode(this.locations);
        hash = 61 * hash + Objects.hashCode(this.doors);
        return hash;
    }

    @Override
    public String toString() {
        String ret = "Rooms: [";
        for (Room room : rooms) {
            ret = ret + room.toString() + "; \n";
        }
        ret = ret + "] Locations: [";
        for (Location loc : locations) {
            ret = ret + loc.toString() + "; \n";
        }
        ret = ret + "] Doors: [";
        for (Door dr : doors) {
            ret = ret + dr.toString() + "; \n";
        }
        return ret + "]";
    }

}
