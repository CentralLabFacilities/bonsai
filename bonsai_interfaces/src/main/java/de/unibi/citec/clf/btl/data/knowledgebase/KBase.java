package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.Type;
import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class KBase extends Type {

    private Arena arena;
    private Crowd crowd;
    private RCObjects rcobjects;
    private Context context;

    public Arena getArena() {
        return arena;
    }

    public void setArena(Arena arena) {
        this.arena = arena;
    }

    public Crowd getCrowd() {
        return crowd;
    }

    public void setCrowd(Crowd crowd) {
        this.crowd = crowd;
    }

    public RCObjects getRCObjects() {
        return rcobjects;
    }

    public void setRCObjects(RCObjects objects) {
        this.rcobjects = objects;
    }

    public Context getContext() {
        return context;
    }

    public void setContext(Context context) {
        this.context = context;
    }

    @Override
    public String toString() {
        return "Arena: [" + arena.toString() + "] Context: [" + context.toString() + "] RCObjects: [" + rcobjects.toString() + "] Crowd: [" + crowd.toString() + "]";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof KBase)) return false;
        if (!super.equals(o)) return false;
        KBase kBase = (KBase) o;
        return Objects.equals(arena, kBase.arena) &&
                Objects.equals(crowd, kBase.crowd) &&
                Objects.equals(rcobjects, kBase.rcobjects) &&
                Objects.equals(context, kBase.context);
    }

    @Override
    public int hashCode() {
        int hash = 3;
        hash = 19 * hash + Objects.hashCode(this.arena);
        hash = 19 * hash + Objects.hashCode(this.crowd);
        hash = 19 * hash + Objects.hashCode(this.rcobjects);
        hash = 19 * hash + Objects.hashCode(this.context);
        return hash;
    }

}
