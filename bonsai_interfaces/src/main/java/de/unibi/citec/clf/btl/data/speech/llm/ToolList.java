package de.unibi.citec.clf.btl.data.speech.llm;

import de.unibi.citec.clf.btl.List;

public class ToolList extends List<Tool> implements Cloneable {
    @Override
    protected Object clone() {
        ToolList other = new ToolList();
        for(Tool e : this.elements) {
            other.add(new Tool(e));
        }
        return other;
    }

    public ToolList() {
        super(Tool.class);
    }
    public ToolList(ToolList other) {
        super(other);
    }
    public ToolList(List<Tool> other) { super(other);  }

}
