package de.unibi.citec.clf.bonsai.memory.slots;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;

import java.util.Objects;
import java.util.function.BiConsumer;

/** An ordinary ObjectSlot that emits an event after each successful write. */
public final class WebSlot<T> extends ObjectSlot<T> {
    private final String path;
    private final BiConsumer<String, Object> onWrite;

    public WebSlot(String path, Class<T> type, BiConsumer<String, Object> onWrite) {
        super(type);
        this.path = Objects.requireNonNull(path, "path");
        this.onWrite = Objects.requireNonNull(onWrite, "onWrite");
    }

    @Override
    public synchronized <S extends T> void memorize(S value) throws CommunicationException {
        System.out.println("WebSlot.memorize: " + path + " = " + value);
        super.memorize(value);
        onWrite.accept(path, value);
    }

    @Override
    public synchronized <S extends T> T recall() throws CommunicationException {
        return super.recall();
    }

    @Override
    public synchronized void forget() throws CommunicationException {
        super.forget();
    }
}
