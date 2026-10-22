package de.unibi.citec.clf.bonsai.engine.communication.web

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.apache.log4j.FileAppender
import org.apache.log4j.Logger
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded JSONL recording: never performs disk IO on the SCXML execution thread. */
internal class WebRuntimeRecorder private constructor(
    private val path: Path,
    capacity: Int = 8192
) : AutoCloseable {
    private val queue = ArrayBlockingQueue<RuntimeEventMessage>(capacity)
    private val closing = AtomicBoolean(false)
    private val failed = AtomicBoolean(false)
    private val thread = Thread({
        try {
            Files.newBufferedWriter(path, StandardCharsets.UTF_8).use { writer ->
                while (!closing.get() || queue.isNotEmpty()) {
                    val event = queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
                    writer.write(Json.encodeToString(event))
                    writer.newLine()
                    writer.flush()
                    if (event.type == "recording_incomplete") {
                        LOG.error("Runtime JSONL recording incomplete: $path (${event.details["reason"]})")
                    }
                }
            }
        } catch (failure: Exception) {
            failed.set(true)
            closing.set(true)
            LOG.error("Runtime JSONL recording incomplete (write failure): $path", failure)
        }
    }, "bonsai-web-jsonl-writer")

    init { thread.isDaemon = true; thread.start() }

    fun record(message: RuntimeEventMessage) {
        if (closing.get() || failed.get()) return
        if (!queue.offer(message) && failed.compareAndSet(false, true)) {
            // This recorder run is no longer complete. Mark it if the disk is
            // healthy; if not, the error log is still the authoritative warning.
            closing.set(true)
            // Bounded constant-time failure path: drop one entry to make room
            // for the incomplete marker, then stop accepting this run.
            queue.poll()
            queue.offer(RuntimeEventMessage("recording_incomplete", Instant.now().toString(),
                details = mapOf("reason" to "recorder_queue_overflow", "complete" to "false"),
                sequence = message.sequence, runId = message.runId))
        }
    }

    override fun close() {
        closing.set(true)
        thread.join(5000)
        if (thread.isAlive) LOG.error("Runtime JSONL recording incomplete (shutdown timeout): $path")
    }

    companion object {
        private val LOG = Logger.getLogger(WebRuntimeRecorder::class.java)
        fun open(): WebRuntimeRecorder? {
            val appenders = Logger.getRootLogger().allAppenders
            var file: String? = null
            while (appenders.hasMoreElements()) {
                val appender = appenders.nextElement()
                if (appender is FileAppender && appender.file != null) { file = appender.file; break }
            }
            val logFile = file ?: run {
                LOG.warn("Runtime JSONL recording disabled: no Log4j file appender is configured")
                return null
            }
            return try {
                val source = Path.of(logFile).toAbsolutePath()
                val stem = source.fileName.toString().substringBeforeLast('.')
                val stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS"))
                val destination = source.resolveSibling("$stem-events-$stamp-${ProcessHandle.current().pid()}.jsonl")
                // The directory belongs to the existing logging setup.
                WebRuntimeRecorder(destination)
            } catch (failure: Exception) {
                LOG.error("Could not initialize runtime JSONL recording", failure)
                null
            }
        }
    }
}
