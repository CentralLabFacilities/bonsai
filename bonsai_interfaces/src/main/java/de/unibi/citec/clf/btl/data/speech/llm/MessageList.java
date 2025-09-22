package de.unibi.citec.clf.btl.data.speech.llm;

import de.unibi.citec.clf.btl.List;

public class MessageList extends List<Message> implements Cloneable {
    @Override
    protected Object clone() {
        MessageList other = new MessageList();
        for(Message e : this.elements) {
            other.add(new Message(e));
        }
        return other;
    }

    public MessageList() {
        super(Message.class);
    }
    public MessageList(MessageList other) {
        super(other);
    }
    public MessageList(List<Message> other) { super(other);  }

}
