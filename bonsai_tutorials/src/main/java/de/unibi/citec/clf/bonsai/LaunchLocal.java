package de.unibi.citec.clf.bonsai;

import de.unibi.citec.clf.bonsai.engine.communication.ROSMinimalServer;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisher;
import de.unibi.citec.clf.bonsai.engine.communication.StateChangePublisherROS;
import de.unibi.citec.clf.bonsai.engine.fxgui.FXGUIStarter;
import de.unibi.citec.clf.bonsai.engine.fxgui.FXGUIWithServer;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import org.apache.log4j.PropertyConfigurator;
import org.ros.namespace.GraphName;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public class LaunchLocal {

    public static final InputStream LOCAL_LOGGING = LaunchLocal.class.getResourceAsStream("/localLogging.properties");
    public static final String PATH_TO_LOCAL_LOGGING = LaunchLocal.class.getResource("/localLogging.properties").getPath();
    public static final InputStream LOCAL_MAPPING = LaunchLocal.class.getResourceAsStream("/localMapping.properties");


    public static void main(String[] args) throws IOException, InterruptedException, ExecutionException, TimeoutException {

        System.err.println("STARTING BONSAI TUTORIAL");

        //prepare logging as server spawns before init
        PropertyConfigurator.configure(LOCAL_LOGGING);

        List<String> params = new ArrayList<>(Arrays.asList(args));
        params.add("-l");
        params.add(PATH_TO_LOCAL_LOGGING);

        boolean haveMapping = false;
        for (String a : new ArrayList<String>(params)) {
            if (a.equals("-m")) {
                haveMapping = true;
                //break;
            }

            //Remove invalid roslaunch params
            if (a.startsWith("__")) {
                params.remove(a);
            }
        }

        if(!haveMapping && LOCAL_MAPPING != null) {
            Properties prop = new Properties();
            prop.load(LOCAL_MAPPING);

            for (Map.Entry<Object, Object> e : prop.entrySet()) {
                params.add("-m");
                params.add(e.getKey() + "=" + e.getValue());
            }
        } else {
            System.out.println("Could not load mappings file");
        }



        //Add Ros server
        //final StateChangePublisher pub = new StateChangePublisherROS("bonsai/transitions");
        //final ROSMinimalServer server = new ROSMinimalServer(GraphName.of("BonsaiServer"),"bonsai/status","bonsai/states");
        //new RosFactory().spawnRosNode(server,true);
        //FXGUIWithServer.setServer(server);
        //FXGUIWithServer.setPub(pub);

        //Start Bonsai
        String[] argb = new String[params.size()];
        params.toArray(argb);
        FXGUIWithServer.main(argb);
    }
}

