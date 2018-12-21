package de.unibi.citec.clf.bonsai.util;


import de.unibi.citec.clf.bonsai.util.exceptions.QueueClosedException;

/**
 * Creates a synchronized bound queue with a limited capacity. Before pushing an
 * object into the queue it removes elements so that the size of the queue is
 * always within the capacity.
 *
 * @param <T> type of elements contained in this queue
 * @author lkettenb
 * @author marc
 * @author jwienke
 */
public class BoundSynchronizedQueue<T> extends SynchronizedQueue<T> {

    private int capacity;
    private T cache;

    /**
     * Returns the maximum capacity of this queue.
     *
     * @return the capacity
     */
    public int getCapacity() {
        return capacity;
    }

    /**
     * Sets the maximum capacity of this queue.
     *
     * @param capacity the capacity to set
     */
    public void setCapacity(int capacity) {
        this.capacity = capacity;
        // TODO what if this queue contains more entries than the new capacity?
    }

    /**
     * Create queue with a given capacity.
     *
     * @param capacity the initial capacity.
     */
    public BoundSynchronizedQueue(int capacity) {
        super();
        this.capacity = capacity;
    }

    /**
     * Create queue with a capacity of 1. This implements a synchronized buffer.
     */
    public BoundSynchronizedQueue() {
        super();
        this.capacity = 1;
    }

    @Override
    public synchronized void push(T element) {
        if (super.isClosed()) {
            throw new QueueClosedException("Queue is closed!");
        }
        // discard all older elements

        while (!super.isEmpty() && super.getSize() >= capacity) {
            super.pop();
        }
        super.push(element);
    }

    /**
     * Retrieves the head of this queue. This method differs from the pop method
     * in that it waits for a new element for a given timeout if the queue is
     * empty. When the waiting thread is interrupted an
     * {@link InterruptedException} will be thrown. If the timeout is reached
     * the last known position is returned.
     *
     * @param timeout the maximum time waiting for a new element in an empty
     *                queue in milliseconds
     * @return the head of this queue
     * @throws InterruptedException if thread is interrupted
     */
    public synchronized T nextCached(long timeout) throws InterruptedException {
        T data = next(timeout);
        if (data == null) {
            T tmp = cache;
            cache = null;
            return tmp;
        } else {
            cache = data;
            return data;
        }
    }
}
