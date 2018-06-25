package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;



import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.PdfWriter;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Gets called at the End of Emergency task.
 * Is used to unmount the USB-stick.
 * @author ikillman
 */
public class FinishReport extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlot<String> filenameSlot;
    private MemorySlot<String> pathSlot;
    private MemorySlot<ObjectShapeList> knownObjectsSlot;
    private MemorySlot<String> counterSlot;
    
    private String filename;
    private String path;
    private String filenameTex;
    
    
    
    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        
        counterSlot = configurator.getSlot("counterSlot", String.class);
        knownObjectsSlot = configurator.getSlot(
                "KnownObjectsSlot", ObjectShapeList.class);
        
        filenameSlot = configurator.getSlot("filenameSlot", String.class);        
        pathSlot = configurator.getSlot("pathSlot", String.class);


    }

    @Override
    public boolean init() {
        try {
            filename = filenameSlot.recall();
            path = pathSlot.recall();
        } catch (CommunicationException ex) {
            logger.error(ex);
            return false;
        }
        filenameTex = path + filename;
        
        return true;
    }

    @Override
    public ExitToken execute() {
        
        try {
            logger.debug("clearing knownObjects and counter");
            counterSlot.forget();
            knownObjectsSlot.forget();
        } catch (CommunicationException ex) {
            Logger.getLogger(FinishReport.class.getName()).log(Level.SEVERE, null, ex);
        }
        
        /*String username = System.getProperty("user.name");    
        String dat = PdfWriter.systemExecute("ls /media/" + username + "/", true);
        String ret = dat.split("\n")[0];
        String usbPath = "/media/" + username + "/" + ret + "/";
        if(PdfWriter.createPDFFile(filenameTex, path))
            return tokenSuccess;
        else 
            return tokenError;*/
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
    
}
