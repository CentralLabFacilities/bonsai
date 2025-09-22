package de.unibi.citec.clf.btl.data.ecwm.robocup;

import de.unibi.citec.clf.btl.List;

import java.util.ArrayList;

public class ModelWithAttributesList extends List<ModelWithAttributes> implements Cloneable {

    @Override
    protected Object clone() {
        ModelWithAttributesList other = new ModelWithAttributesList();
        for(ModelWithAttributes e : this.elements) {
            other.add(new ModelWithAttributes(e));
        }
        return other;
    }

    public ModelWithAttributesList() {
        super(ModelWithAttributes.class);
    }
    public ModelWithAttributesList(ModelWithAttributesList other) {
        super(other);
    }
    public ModelWithAttributesList(List<ModelWithAttributes> other) { super(other); }

    public ArrayList<ModelWithAttributes> getEntitiesByAttribute(String attribute, String value) {
        ArrayList<ModelWithAttributes> results = new ArrayList<>();
        for (ModelWithAttributes e : elements) {
            if (e.hasAttributeWithValue(attribute, value)) {
                results.add(e);
            }
        }
        return results;
    }
}
