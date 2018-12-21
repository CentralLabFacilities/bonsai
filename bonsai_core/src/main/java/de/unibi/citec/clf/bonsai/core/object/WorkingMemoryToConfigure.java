package de.unibi.citec.clf.bonsai.core.object;

import java.util.Map;
import java.util.Set;

/**
 * Class encapsulating an working memory to configure.
 *
 * @author lziegler
 */
public class WorkingMemoryToConfigure {

    private String key;
    private Class<? extends WorkingMemory> memoryClass;
    private Map<String, String> memoryOptions;
    private Set<SlotToConfigure> slots;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public Class<? extends WorkingMemory> getMemoryClass() {
        return memoryClass;
    }

    public void setMemoryClass(Class<? extends WorkingMemory> memoryClass) {
        this.memoryClass = memoryClass;
    }

    public Map<String, String> getMemoryOptions() {
        return memoryOptions;
    }

    public void setMemoryOptions(Map<String, String> memoryOptions) {
        this.memoryOptions = memoryOptions;
    }

    public Set<SlotToConfigure> getSlots() {
        return slots;
    }

    public void setSlots(Set<SlotToConfigure> slots) {
        this.slots = slots;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "WorkingMemoryToConfigure [memoryClass=" + memoryClass + ", memoryOptions=" + memoryOptions + ", slots=" + slots + ", key=" + key + "]";
    }

}
