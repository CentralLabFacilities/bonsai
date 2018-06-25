
package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.object.MemorySlot;

/**
 * Class encapsulating an memory slot to configure.
 *
 * @author lziegler
 */
public class SlotToConfigure {

    private Class<? extends MemorySlot<?>> slotClass;
    private Class<?> dataTypeClass;

    public Class<? extends MemorySlot<?>> getSlotClass() {
        return slotClass;
    }

    public void setSlotClass(Class<? extends MemorySlot<?>> slotClass) {
        this.slotClass = slotClass;
    }

    public Class<?> getDataTypeClass() {
        return dataTypeClass;
    }

    public void setDataTypeClass(Class<?> dataTypeClass) {
        this.dataTypeClass = dataTypeClass;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "SlotToConfigure [slotClass=" + slotClass + ", dataTypeClass=" + dataTypeClass + "]";
    }
    
}
