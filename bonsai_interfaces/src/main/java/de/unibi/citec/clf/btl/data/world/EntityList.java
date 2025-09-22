package de.unibi.citec.clf.btl.data.world;

import de.unibi.citec.clf.btl.List;

import javax.annotation.Nullable;

public class EntityList extends List<Entity> implements Cloneable {
    @Override
    protected Object clone() {
        EntityList other = new EntityList();
        for(Entity e : this.elements) {
            other.add(new Entity(e));
        }
        return other;
    }

    public EntityList() {
        super(Entity.class);
    }
    public EntityList(EntityList other) {
        super(other);
    }
    public EntityList(List<Entity> other) { super(other);  }

    @Nullable
    public Entity getEntityById(String name) {
        for (Entity e : elements) {
            if (e.getId().equals(name)) {
                return e;
            }
        }
        return null;
    }
}
