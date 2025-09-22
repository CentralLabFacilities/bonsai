package de.unibi.citec.clf.btl.data.world;

import de.unibi.citec.clf.btl.List;

import javax.annotation.Nullable;
import java.util.stream.Collectors;

public class ModelList extends List<Model>{

    public ModelList() {
        super(Model.class);
    }
    public ModelList(ModelList other) {
        super(other);
    }
    public ModelList(List<Model> other) { super(other);  }

    @Nullable
    public Model getModelyByType(String type) {
        for (Model e : elements) {
            if (e.getTypeName().equals(type)) {
                return e;
            }
        }
        return null;
    }

    public boolean containsType(String type) {
        for (Model e : elements) {
            if (e.getTypeName().equals(type)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public String toString() {
        return "Models: " + elements.stream().map(Model::getTypeName).collect(Collectors.joining(", "));
    }
}
