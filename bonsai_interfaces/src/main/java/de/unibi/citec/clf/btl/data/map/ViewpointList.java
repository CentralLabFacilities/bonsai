
package de.unibi.citec.clf.btl.data.map;


import de.unibi.citec.clf.btl.List;

/**
 *
 * @author kharmening
 */
public class ViewpointList extends List<Viewpoint> {

    /**
     * Constructor.
     */
    public ViewpointList() {
        super(Viewpoint.class);
    }

    /**
     * Add a Viewpoint to the list.
     * 
     * checks if a Viewpoint with label == v.getLabel() already exists and 
     * replaces this inside the list
     * 
     * @param v viewpoint to add
     * @return if viewpoint was added or replaced another
     */
    public boolean replaceOrAdd(Viewpoint v) {
        boolean replaced = false;
        Viewpoint vp;

        for (int i = 0; i < this.size(); i++) {
            vp = this.get(i);
            if (vp.getLabel().equals(v.getLabel())) {
                this.set(i, v);
                replaced = true;
                break;
            }
        }

        if (!replaced) {
            this.add(v);
        }
        return replaced;
    }

}
