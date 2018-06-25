package de.unibi.citec.clf.btl.data.knowledgebase;

import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class RCObject extends BDO {

    private String name;
    private String location;
    private String category;
    private String shape;
    private String color;
    private String type;
    private int size;
    private int weight;

    /**
     * @return the name
     */
    public String getName() {
        return name;
    }

    /**
     * @param name the name to set
     */
    public void setName(String name) {
        this.name = name;
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
     * @return the category
     */
    public String getCategory() {
        return category;
    }

    /**
     * @param category the category to set
     */
    public void setCategory(String category) {
        this.category = category;
    }

    /**
     * @return the size
     */
    public int getSize() {
        return size;
    }

    /**
     * @param size the size to set
     */
    public void setSize(int size) {
        this.size = size;
    }

    /**
     * @return the shape
     */
    public String getShape() {
        return shape;
    }

    /**
     * @param shape the shape to set
     */
    public void setShape(String shape) {
        this.shape = shape;
    }

    /**
     * @return the color
     */
    public String getColor() {
        return color;
    }

    /**
     * @param color the color to set
     */
    public void setColor(String color) {
        this.color = color;
    }

    /**
     * @return the type
     */
    public String getType() {
        return type;
    }

    /**
     * @param type the type to set
     */
    public void setType(String type) {
        this.type = type;
    }

    /**
     * @return the weight
     */
    public int getWeight() {
        return weight;
    }

    /**
     * @param weight the weight to set
     */
    public void setWeight(int weight) {
        this.weight = weight;
    }

    public String getProperty(String propname) {
        String prop = "";
        switch (propname) {
            case "category":
                prop = this.getCategory();
                break;
            case "color":
                prop = this.getColor();
                break;
            //skip graspdifficulty
            case "location":
                prop = this.getLocation();
                break;
            case "name":
                prop = this.getName();
                break;
            case "shape":
                prop = this.getShape();
                break;
            case "size":
                prop = String.valueOf(this.getSize());
                break;
            case "type":
                prop = this.getType();
                break;
            case "weight":
                prop = String.valueOf(this.getWeight());
                break;
            default:
                prop = "unknown";
        }

        return prop;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RCObject)) return false;
        if (!super.equals(o)) return false;
        RCObject rcObject = (RCObject) o;
        return size == rcObject.size &&
                weight == rcObject.weight &&
                Objects.equals(name, rcObject.name) &&
                Objects.equals(location, rcObject.location) &&
                Objects.equals(category, rcObject.category) &&
                Objects.equals(shape, rcObject.shape) &&
                Objects.equals(color, rcObject.color) &&
                Objects.equals(type, rcObject.type);
    }

    @Override
    public int hashCode() {
        int hash = 5;
        hash = 53 * hash + Objects.hashCode(this.name);
        hash = 53 * hash + Objects.hashCode(this.location);
        hash = 53 * hash + Objects.hashCode(this.category);
        hash = 53 * hash + Objects.hashCode(this.shape);
        hash = 53 * hash + Objects.hashCode(this.color);
        hash = 53 * hash + Objects.hashCode(this.type);
        hash = 53 * hash + this.size;
        hash = 53 * hash + this.weight;
        return hash;
    }

    @Override
    public String toString(){
        String obj = "[";
        obj += "[frameid = " + frameId;
        obj += "; generator = " + generator;
        obj += "] name = " + name;
        obj += "; location = " + location;
        obj += "; category = " + category;
        obj += "; shape = " + shape;
        obj += "; color = " + color;
        obj += "; type = " + type;
        obj += "; size = " + size;
        obj += "; weight = " + weight;
        return obj + "]";
    }

}
