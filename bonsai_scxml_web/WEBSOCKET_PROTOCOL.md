# Bonsai SCXML runtime: event-only WebSocket

The editor loads the state-machine definition, subscribes to `ws://localhost:8080/bonsai/ws`, **waits for `stream_ready`**, and only then sends `POST /bonsai/start`.

## Subscription acknowledgement

The server immediately queues one transport acknowledgement after registering a client:

```json
{"type":"stream_ready","timestamp":"2026-10-20T09:00:00Z","sequence":42,"runId":"server-session-id","details":{}}
```

`stream_ready` is **not** a runtime change, is not written to JSONL, and must not be included in the timeline. Its sequence is the last published change, so the next change has sequence 43. The client must not send Start until this acknowledgement is received.

## Runtime events

All later frames are runtime events of the form:

```json
{"type":"state_entered","timestamp":"2026-10-20T09:00:01Z","sequence":43,"runId":"server-session-id","details":{"state":"Idle"}}
```

The client requires consecutive sequence numbers with the same `runId`. It reconstructs history from `status`, `state_entered`, `state_exited`, `transition`, `datamodel_scope_initialized`, `datamodel_assignment`, `slot_registered`, `slot_written`, `slot_cleared`, `parameter`, and other observed changes.

- `datamodel_scope_initialized` introduces a state/global scope (`valuesJson`) before its first observed assignment. Later assignments carry their declaring `scope` and immutable old/new values.
- A slot requested while the WebSocket is connected produces `slot_registered` immediately. Existing slots requested during Load are **re-announced at Start**, including their value status, so the trace does not depend on a pre-connection snapshot.
- Slot values are frozen string representations, not reconstructable Java objects. Null and unknown values are distinguished using metadata.
- The editor caches derived **playback frames** locally; the backend provides no runtime snapshots or replay.

## Disconnects and failure

There is **no automatic reconnection, replay buffer, SSE endpoint, or `/bonsai/snapshot` endpoint**. If the socket disconnects or a sequence gap occurs, the GUI marks the active trace incomplete and stops following it. No recovery baseline is requested. A subsequent execution can establish a new subscription before Start, but it must not silently extend the interrupted trace.

The state machine is **not stopped automatically** when monitoring disconnects. HTTP control endpoints (including Stop) remain independent. A slow WebSocket client is disconnected when its bounded event queue fills; disk logging uses its own bounded asynchronous JSONL queue.

## Recording limitations

A complete trace requires a healthy subscription **before** Start and events for every relevant mutation. Direct modifications that bypass monitoring (such as unobserved mutable objects stored in slots) cannot be reconstructed exactly. The GUI's own history cache also has configured size limits.

## Configuration and safety

`WebMemoryFactory` must be used for observable working memory. The server's control and inspection APIs inherit its existing access policy; do not expose them on an untrusted network without authentication and WebSocket origin validation.
