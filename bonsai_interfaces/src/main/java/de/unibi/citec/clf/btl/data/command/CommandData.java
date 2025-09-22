package de.unibi.citec.clf.btl.data.command;


import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.speech.GrammarNonTerminal;
import java.util.Objects;

/**
 *
 * @author gminareci, ikillman
 */
@Deprecated
public class CommandData extends Type {

    private GrammarNonTerminal tree = new GrammarNonTerminal();
    //default werte:
    
    private String action = "action";
    private String location = "place";
    private String object = "object";
    private String person = "person";
    
    private String room = "room";
    
    private String secondLocation = "somewhere";
    private String preposition = "";
    
    private boolean actionset = false;
    private boolean locationset = false;
    private boolean objectset = false;
    private boolean personset = false;
    private boolean roomset = false;
    private boolean secondLocationset = false;
    private boolean prepositionset = false;

    /**
     * @return the action
     */
    public String getAction() {
        return action;
    }

    /**
     * @param action the action to set
     */
    public void setAction(String action) {
        this.action = action;
    }

    /**
     * @return the location
     */
    public String getLocation() {
        return location;
    }

    /**
     * @param location the location to set
     */
    public void setLocation(String location) {
        this.location = location;
    }

    /**
     * @return the object
     */
    public String getObject() {
        return object;
    }

    /**
     * @param object the object to set
     */
    public void setObject(String object) {
        this.object = object;
    }

    /**
     * @return the room
     */
    public String getRoom() {
        return room;
    }

    /**
     * @param room the room to set
     */
    public void setRoom(String room) {
        this.room = room;
    }

    /**
     * @return the tree
     */
    public GrammarNonTerminal getTree() {
        return tree;
    }

    /**
     * @param tree the tree to set
     */
    public void setTree(GrammarNonTerminal tree) {
        this.tree = tree;
    }

    /**
     * @return the person
     */
    public String getPerson() {
        return person;
    }

    /**
     * @param person the person to set
     */
    public void setPerson(String person) {
        this.person = person;
    }

    /**
     * @return the actionsetted
     */
    public boolean isActionset() {
        return actionset;
    }

    /**
     * @return the locationsetted
     */
    public boolean isLocationset() {
        return locationset;
    }

    /**
     * @return the objectsetted
     */
    public boolean isObjectset() {
        return objectset;
    }

    /**
     * @return the personsetted
     */
    public boolean isPersonset() {
        return personset;
    }

    /**
     * @return the roomsetted
     */
    public boolean isRoomset() {
        return roomset;
    }

    /**
     * @param actionsetted the actionsetted to set
     */
    public void setActionset(boolean actionsetted) {
        this.actionset = actionsetted;
    }

    /**
     * @param locationsetted the locationsetted to set
     */
    public void setLocationset(boolean locationsetted) {
        this.locationset = locationsetted;
    }

    /**
     * @param objectsetted the objectsetted to set
     */
    public void setObjectset(boolean objectsetted) {
        this.objectset = objectsetted;
    }

    /**
     * @param personsetted the personsetted to set
     */
    public void setPersonset(boolean personsetted) {
        this.personset = personsetted;
    }

    /**
     * @param roomsetted the roomsetted to set
     */
    public void setRoomset(boolean roomsetted) {
        this.roomset = roomsetted;
    }

    /**
     * @return the secondLocation
     */
    public String getSecondLocation() {
        return secondLocation;
    }

    /**
     * @param secondLocation the secondLocation to set
     */
    public void setSecondLocation(String secondLocation) {
        this.secondLocation = secondLocation;
    }

    /**
     * @return the preposition
     */
    public String getPreposition() {
        return preposition;
    }

    /**
     * @param preposition the preposition to set
     */
    public void setPreposition(String preposition) {
        this.preposition = preposition;
    }

    /**
     * @return the secondLocationset
     */
    public boolean isSecondLocationset() {
        return secondLocationset;
    }

    /**
     * @param secondLocationset the secondLocationset to set
     */
    public void setSecondLocationset(boolean secondLocationset) {
        this.secondLocationset = secondLocationset;
    }

    /**
     * @return the prepositionset
     */
    public boolean isPrepositionset() {
        return prepositionset;
    }

    /**
     * @param prepositionset the prepositionset to set
     */
    public void setPrepositionset(boolean prepositionset) {
        this.prepositionset = prepositionset;
    }
    
    @Override
    public int hashCode() {
        int hash = 5;
        hash = 23 * hash + Objects.hashCode(this.tree);
        hash = 23 * hash + Objects.hashCode(this.action);
        hash = 23 * hash + Objects.hashCode(this.location);
        hash = 23 * hash + Objects.hashCode(this.object);
        hash = 23 * hash + Objects.hashCode(this.person);
        hash = 23 * hash + Objects.hashCode(this.room);
        hash = 23 * hash + Objects.hashCode(this.secondLocation);
        hash = 23 * hash + Objects.hashCode(this.preposition);
        hash = 23 * hash + (this.actionset ? 1 : 0);
        hash = 23 * hash + (this.locationset ? 1 : 0);
        hash = 23 * hash + (this.objectset ? 1 : 0);
        hash = 23 * hash + (this.personset ? 1 : 0);
        hash = 23 * hash + (this.roomset ? 1 : 0);
        hash = 23 * hash + (this.secondLocationset ? 1 : 0);
        hash = 23 * hash + (this.prepositionset ? 1 : 0);
        return hash;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CommandData)) return false;
        if (!super.equals(o)) return false;
        CommandData that = (CommandData) o;
        return actionset == that.actionset &&
                locationset == that.locationset &&
                objectset == that.objectset &&
                personset == that.personset &&
                roomset == that.roomset &&
                secondLocationset == that.secondLocationset &&
                prepositionset == that.prepositionset &&
                Objects.equals(tree, that.tree) &&
                Objects.equals(action, that.action) &&
                Objects.equals(location, that.location) &&
                Objects.equals(object, that.object) &&
                Objects.equals(person, that.person) &&
                Objects.equals(room, that.room) &&
                Objects.equals(secondLocation, that.secondLocation) &&
                Objects.equals(preposition, that.preposition);
    }
}
