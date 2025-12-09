package de.unibi.citec.clf.bonsai.engine.scxml;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.engine.LoadingResults;
import de.unibi.citec.clf.bonsai.engine.SkillStateMachine;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.test.TestListener;


import java.util.Map;
import java.util.concurrent.TimeoutException;
public class TestTools {

    static final String PATH_TO_SM = TestTools.class.getResource("/state_machines").getPath();
    static final String PATH_TO_CF = TestTools.class.getResource("/bonsai_configs").getPath();

    private TestTools() {

    }

    static LoadingResults loadStatemachine(String scxml) {
        final String config = "TestConfig.xml";
        return loadStatemachine(scxml, config);
    }

    static LoadingResults loadStatemachine(String scxml, String config) {
        final String pathSM = PATH_TO_SM + "/" + scxml;
        final String pathToConfig = PATH_TO_CF + "/" + config;

        Map<String,String> mapping = Map.of(
                "TEST", PATH_TO_SM
        );

        SkillStateMachine skillStateMachine = new SkillStateMachine(mapping);
        try {
            return skillStateMachine.initalize(pathSM,pathToConfig,true);
        }  catch (Exception t) {
            System.err.println("Fatal state machine configuration error: " + t.getClass().getSimpleName() + ": " + t.getMessage());
            throw new ConfigurationException(t);
        }

    }

    static boolean testStatemachine(String config, String scxml, TestListener test) throws TimeoutException {
        final String pathSM = PATH_TO_SM + "/" + scxml;
        final String pathToConfig = PATH_TO_CF + "/" + config;

        Map<String,String> mapping = Map.of(
                "TEST", PATH_TO_SM
        );

        SkillStateMachine skillStateMachine = new SkillStateMachine(mapping);

        StateMachineController stateMachineController = new StateMachineController(skillStateMachine, pathToConfig,
                pathSM, false);

        stateMachineController.initialize();

        skillStateMachine.addListener(test);

        if(!stateMachineController.load(true).success()) return false;

        stateMachineController.executeStateMachine();

        boolean ret = test.waitForStatus();

        skillStateMachine.stopMachine();

        return ret;
    }
}
