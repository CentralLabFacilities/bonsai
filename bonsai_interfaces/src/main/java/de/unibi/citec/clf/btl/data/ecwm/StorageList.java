package de.unibi.citec.clf.btl.data.ecwm;

import de.unibi.citec.clf.btl.List;

public class StorageList extends List<StorageArea> {

    /**
     * Default constructor.
     */
    public StorageList() {
        super(StorageArea.class);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String text = "[StringList\n";
        for (StorageArea data : this) {
            text += "\t" + data + "\n";
        }
        text += "]";
        return text;
    }
}
