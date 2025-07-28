package de.unibi.citec.clf.bonsai.ros.helper

import de.unibi.citec.clf.bonsai.core.time.Time
import org.ros.exception.RemoteException
import org.ros.internal.message.Message
import org.ros.node.service.ServiceResponseListener
import java.util.concurrent.ExecutionException
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * @param <M>
 * @author lruegeme
 */
class ResponseFuture<M : Message> : Future<M?>, ServiceResponseListener<M> {
    var response: M? = null
    var finished = false
    var exception: RemoteException? = null
    fun succeeded(): Boolean {
        return finished && exception == null
    }

    override fun cancel(bln: Boolean): Boolean {
        return false
    }

    override fun isCancelled(): Boolean {
        return false
    }

    override fun isDone(): Boolean {
        return finished
    }

    @Throws(InterruptedException::class, ExecutionException::class)
    override fun get(): M? {
        while (!finished) {
            Thread.sleep(50)
        }
        if (exception != null) {
            throw ExecutionException(exception)
        }
        return response
    }

    @Throws(InterruptedException::class, ExecutionException::class, TimeoutException::class)
    override fun get(l: Long, tu: TimeUnit): M? {
        val timeout = Time.currentTimeMillis() + (tu.toMillis(l))
        while (!finished) {
            if (Time.currentTimeMillis() > timeout) {
                throw TimeoutException()
            }
            Thread.sleep(50)
        }
        if (exception != null) {
            throw ExecutionException(exception)
        }
        return response
    }

    override fun onSuccess(mt: M) {
        response = mt
        finished = true
    }

    override fun onFailure(re: RemoteException) {
        exception = re
        finished = true
    }

    fun <T> toTypeFuture(converter: (M) -> T): Future<T?> {
        val res: ResponseFuture<M> = this
        return object : Future<T?> {
            override fun cancel(bln: Boolean): Boolean = res.cancel(bln)
            override fun isCancelled(): Boolean = res.isCancelled
            override fun isDone(): Boolean = res.isDone

            @Throws(InterruptedException::class, ExecutionException::class)
            override fun get(): T? = get(1, TimeUnit.DAYS)

            @Throws(InterruptedException::class, ExecutionException::class)
            override fun get(p0: Long, p1: TimeUnit): T? {
                val msg = res.get(p0, p1)
                return if (msg != null) converter(msg) else null
            }
        }
    }

    fun toBooleanFuture(): Future<Boolean> {
        val res: ResponseFuture<*> = this
        return object : Future<Boolean> {
            override fun cancel(bln: Boolean): Boolean = res.cancel(bln)
            override fun isCancelled(): Boolean = res.isCancelled
            override fun isDone(): Boolean = res.isDone

            @Throws(InterruptedException::class, ExecutionException::class)
            override fun get(): Boolean {
                return try {
                    res.get() != null
                } catch (ex: ExecutionException) {
                    false
                }
            }

            @Throws(InterruptedException::class, ExecutionException::class, TimeoutException::class)
            override fun get(l: Long, tu: TimeUnit): Boolean {
                return try {
                    res.get(l, tu) != null
                } catch (ex: ExecutionException) {
                    false
                }
            }
        }
    }

}