package de.unibi.citec.clf.bonsai.engine.scxml;

import de.unibi.citec.clf.bonsai.util.reflection.ReflectionServiceDiscovery;
import org.apache.commons.scxml2.model.Action;
import org.apache.commons.scxml2.model.CustomAction;

import java.util.ArrayList;
import java.util.List;

public class BonsaiActionProvider {

    private static final String ACTION_PKG = "de.unibi.citec.clf.bonsai.actions";

    public static List<CustomAction> getActions() {
        ReflectionServiceDiscovery discovery = new ReflectionServiceDiscovery(ACTION_PKG);
        List<CustomAction> customActions = new ArrayList<CustomAction>();
        var actions = discovery.discoverServicesByInterface(BonsaiAction.class);
        for (var action : actions) {

            var pkg = action.getPackageName();
            var namespace = "http://de.unibi.citec.clf.bonsai/";
            if (pkg.length() > ACTION_PKG.length()) {
                namespace += pkg.substring(ACTION_PKG.length()+1);
            }

            customActions.add(new CustomAction(
                    namespace,
                    action.getSimpleName().toLowerCase(),
                    action)
            );
        }
        return customActions;
    }
}
