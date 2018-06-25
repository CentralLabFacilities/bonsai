package de.unibi.citec.clf.bonsai.engine.scxml;


import de.unibi.citec.clf.bonsai.engine.model.StateID;

import java.util.*;

public class SkillConfigFaults {

    private static final long serialVersionUID = 862982470160354831L;
    private String message;

    List<String> errorNoSlotD = new ArrayList<>();
    List<String> errorNoConfigS = new ArrayList<>();
    Map<String, Class<?>> errorNoMatchS = new HashMap<>();
    List<String> errorNoConfigA = new ArrayList<>();
    Map<String, Class<?>> errorNoMatchA = new HashMap<>();
    List<String> warningDefaultSlotD = new ArrayList<>();

    private StateID state;
    private boolean isError;

    public SkillConfigFaults(StateID state) {
        message = "";
        this.state = state;
    }

    public SkillConfigFaults(StateID state, String msg, boolean isError) {
        message = msg;
        this.state = state;
        this.isError = isError;
    }

    public SkillConfigFaults(StateID state, String msg) {
        message = msg;
        this.state = state;
    }

    public SkillConfigFaults(StateID state, String msg, List<String> noSensorConfig,
                             List<String> noActuatorConfig, List<String> defaultSlotDefinition,
                             Map<String, Class<?>> noSensorMatch,
                             Map<String, Class<?>> noActuatorMatch) {
        //super(msg);
        this.state = state;
        errorNoConfigS = noSensorConfig;
        errorNoConfigA = noActuatorConfig;
        errorNoMatchS = noSensorMatch;
        errorNoMatchA = noActuatorMatch;
        warningDefaultSlotD = defaultSlotDefinition;
    }

    public void addNoSlotDefinition(String key) {
        errorNoSlotD.add(key);
    }

    public void addDefaultSlotDefinition(String key) {
        warningDefaultSlotD.add(key);
    }

    public void addNoSensor(String key) {
        errorNoConfigS.add(key);
    }

    public void addNoActuator(String key) {
        errorNoConfigA.add(key);
    }

    public void addNoSensorMatch(String key, Class<?> t) {
        errorNoMatchS.put(key, t);
    }

    public void addNoActuatorMatch(String key, Class<?> t) {
        errorNoMatchA.put(key, t);
    }

    public boolean hasError() {
        return isError || !errorNoConfigA.isEmpty() || !errorNoConfigS.isEmpty()
                || !errorNoMatchA.isEmpty() || !errorNoMatchS.isEmpty() || !errorNoSlotD.isEmpty();
    }

    public boolean hasWarning() {
        return !warningDefaultSlotD.isEmpty();
    }

    public StateID getState() {
        return state;
    }

    public void setState(StateID state) {
        this.state = state;
    }

    public List<String> getNoSlotDefinitions() {
        return errorNoSlotD;
    }

    public List<String> getDefaultSlotWarnings() {
        return warningDefaultSlotD;
    }

    public String getErrorMessage() {
        StringBuilder msg = Optional.ofNullable(message).map(StringBuilder::new).orElse(null);
        if (msg == null) {
            msg = new StringBuilder();
        }
        if (!errorNoConfigS.isEmpty()) {
            msg.append("\nBonsai config does not contain sensors with keys:\n");
            for (String s : errorNoConfigS) {
                msg.append("    \"").append(s).append("\"\n");
            }
        }
        if (!errorNoConfigA.isEmpty()) {
            msg.append("\nBonsai config does not contain actuators with keys:\n");
            for (String s : errorNoConfigA) {
                msg.append("    \"").append(s).append("\"\n");
            }
        }
        if (!errorNoMatchS.isEmpty()) {
            msg.append("\nBonsai config does not contain correct config for:\n");
            for (String s : errorNoMatchS.keySet()) {
                msg.append("    \"").append(s).append("\" with sensorClass: \"").append(errorNoMatchS.get(s).getCanonicalName()).append("\"\n");
            }
        }
        if (!errorNoMatchA.isEmpty()) {
            msg.append("\nBonsai config does not contain correct config for:\n");
            for (String s : errorNoMatchA.keySet()) {
                msg.append("    \"").append(s).append("\" with actuatorClass: \"").append(errorNoMatchA.get(s).getCanonicalName()).append("\"\n");
            }
        }
        return msg.toString();
    }

    public String getWarnings() {
        StringBuilder msg = new StringBuilder();
        if (!warningDefaultSlotD.isEmpty()) {
            for (String s : warningDefaultSlotD) {
                msg.append("    \"").append(s).append("\"\n");
            }
        }
        return msg.toString();
    }

}
