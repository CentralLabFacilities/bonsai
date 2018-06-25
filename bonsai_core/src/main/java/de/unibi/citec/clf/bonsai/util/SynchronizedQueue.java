package de.unibi.citec.clf.bonsai.util;


import de.unibi.citec.clf.bonsai.util.exceptions.QueueClosedException;

import java.util.LinkedList;
import java.util.NoSuchElementException;

import org.apache.log4j.Logger;

/**
 * This abstract class provides a queue that orders its elements of a type <T>
 * in a FIFO (first-in-first-out) manner. The head of the queue is that element
 * which would be retrieved and removed by a call to {@link #next()} or
 * {@link #pop()}. All new elements are inserted at the tail of the queue via
 * {@link #push(Object)}. A SynchronizedQueue can be closed via close() meaning
 * that no further elements can be pushed in. Retrieving elements that are
 * already in queue before the call to {@link #close()} occurred is still
 * possible until the queue is empty. All operations on a SynchronizedQueue are
 * synchronized as the name implies.
 * 
 * @param <T>
 *            type of elements
 * 
 * @author lkettenb
 * @author swrede
 */
public class SynchronizedQueue<T> {

    private LinkedList<T> queue = new LinkedList<>();
    private boolean closed = false;
    private static final Logger logger = Logger.getLogger(SynchronizedQueue.class);

    /**
     * Tests whether this queue has been closed.
     * 
     * @return true if queue is closed; false otherwise.
     */
    public synchronized boolean isClosed() {
        return closed;
    }
    
    public synchronized LinkedList<T> getAllElements() {
        LinkedList<T> list = new LinkedList<>(queue);
//        java.util.Collections.copy(list, queue);
//        list.addAll(queue);
        return list;
    }

    public synchronized void waitClosed() {
        while (!closed) {
            try {
                this.wait();
            } catch (java.lang.InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Empties the queue, so that all elements will be deleted.
     */
    public synchronized void clear() {
        queue.clear();

    }

    /**
     * Returns the number of elements in this SynchronizedQueue.
     * 
     * @return the number of elements
     */
    public synchronized int getSize() {
        return queue.size();
    }

    /**
     * Inserts a given element at the tail of the queue as long as it is not
     * closed. If it is closed a QueueClosedException will be thrown.
     * 
     * @param element
     *            an element to be inserted.
     * @throws QueueClosedException
     *             if queue is already closed.
     */
    public synchronized void push(T element) {
        if (closed) {
            throw new QueueClosedException("Queue is closed!");
        }
        queue.push(element);
        notifyAll();
    }

    /**
     * Retrieves and removes the head of this queue, or null if it is empty. If
     * the queue is empty and closed a QueueClosedException will be thrown.
     * 
     * @return the head of the queue, or null if it is empty, but not closed.
     * @throws QueueClosedException
     *             if this queue is empty and closed.
     */
    public synchronized T pop() {
        if (queue.isEmpty() && closed) {
            throw new QueueClosedException("Queue is closed!");
        }
        try {
            return queue.pop();
        } catch (NoSuchElementException e) {
            logger.trace("Queue is empty");
            return null;
        }
    }
    
    /**
     * Retrieves the head of this queue, or null if it is empty. If
     * the queue is empty and closed a QueueClosedException will be thrown.
     * 
     * @return the head of the queue, or null if it is empty, but not closed.
     * @throws QueueClosedException
     *             if this queue is empty and closed.
     */
    public synchronized T front() {
        if (queue.isEmpty() && closed) {
            throw new QueueClosedException("Queue is closed!");
        }
        try {
            return queue.peekFirst();
        } catch (NoSuchElementException e) {
            logger.trace("Queue is empty");
            return null;
        }
    }

    /**
     * Tests whether the queue has a head element.
     * 
     * @return true if queue has a head; false otherwise.
     */
    public synchronized boolean hasNext() {
        return !queue.isEmpty();
    }

    /**
     * Retrieves and removes the head of this queue. This method differs from
     * the pop method in that it waits for a new element if the queue is empty.
     * 
     * @return the head of this queue or null
     * @throws InterruptedException
     */
    public synchronized T next() throws InterruptedException {
        return next(-1);
    }

    /**
     * Retrieves and removes the head of this queue. This method differs from
     * the pop method in that it waits for a new element for a given timeout if
     * the queue is empty. When the waiting thread is interrupted an
     * {@link InterruptedException} will be thrown.
     * 
     * @param timeout
     *            the maximum time waiting for a new element in an empty queue
     *            in milliseconds
     * @return the head of this queue or null
     * @throws InterruptedException
     *             if thread is interrupted
     */
    public synchronized T next(long timeout) throws InterruptedException {
        waitForNext(timeout);
        return pop();
    }

    public synchronized void waitForNext() throws InterruptedException {
        waitForNext(-1);
    }

    /**
     * wait until a new element becomes available.
     * 
     * @param timeout
     * @throws InterruptedException
     *             if this thread was interrupted while waiting
     * @throws QueueClosedException
     *             if the queue has been closed
     */
    public synchronized void waitForNext(long timeout) throws InterruptedException {
        if (!closed && queue.isEmpty()) {
            // queue is not closed but empty
            // wait for new element to be inserted
            // will be notified upon push or close
            if (timeout == -1) {
                this.wait();
            } else {
                this.wait(timeout);
            }
        }
        // need to check again, because of possible change during wait
        if (closed && queue.isEmpty()) {
            // queue is closed and empty
            throw new QueueClosedException("queue is closed");
        }
    }

    /**
     * Closes the queue so that no further elements can be pushed in it. It is
     * still possible to retrieve all elements already stored in the queue via
     * methods next() and pop().
     */
    public synchronized void close() {
        closed = true;
        notifyAll();
    }

    public boolean isEmpty() {
        return queue.isEmpty();
    }
}
