package de.unibi.citec.clf.bonsai.engine.scxml;


import java.util.ArrayList;
import java.util.List;

/**
 * a Message containing the informations gatherd by the RunResultFrame.
 *
 * @author gminareci
 */
public class FalseDetectionMessage {

    /**
     * the status. for example (componentProblem or configureProblem)
     */
    private String status = "";

    /**
     * should be filled with the Symptoms.
     */
    private String symptoms = "";

    /**
     * should be filled with a list of all components that did not run properly.
     */
    private List<Component> components;

    /**
     * Constructor of the falseDetectionMessage.
     */
    public FalseDetectionMessage() {
        components = new ArrayList<>();

    }

    /**
     * parses the containing fields into a String.
     *
     * @return a String in a xml-like structure.
     */
    public String toString() {
        StringBuilder result = new StringBuilder(" <RESULT> " + " <status> " + status + " </status> " + " <symptoms> " + symptoms
                + " </symptoms>" + " <components> ");
        if (components != null) {
            for (Component c : components) {
                result.append(" <component> <name> ").append(c.componentName).append(" </name> ").append(" <problem> ").append(c.problem).append(" </problem> ").append(" <time> ").append(c.time).append(" </time> ").append(" </component> ");
            }
        }
        result.append(" </components> </RESULT>");
        return result.toString();
    }


    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getSymptoms() {
        return symptoms;
    }

    public void setSymptoms(String symptoms) {
        this.symptoms = symptoms;
    }

    public List<Component> getComponents() {
        return components;
    }

    public void setComponents(List<Component> components) {
        this.components = components;
    }

    /**
     * Inner Class for the Components.
     *
     * @author gminareci
     */
    public class Component {

        /**
         * the components name.
         */
        private String componentName = "";

        /**
         * the components problem.
         */
        private String problem = "";

        /**
         * time, when the component got defunct.
         */
        private String time = "";

        /**
         * Constructor.
         *
         * @param componentName the components name.
         * @param problem       the components problem.
         * @param time,         when the component got defunct.
         */
        public Component(String componentName, String problem, String time) {
            this.componentName = componentName;
            this.problem = problem;
            this.time = time;
        }

        public String getComponentName() {
            return componentName;
        }

        public void setComponentName(String componentName) {
            this.componentName = componentName;
        }

        public String getProblem() {
            return problem;
        }

        public void setProblem(String problem) {
            this.problem = problem;
        }

        public String getTime() {
            return time;
        }

        public void setTime(String time) {
            this.time = time;
        }
    }
}
