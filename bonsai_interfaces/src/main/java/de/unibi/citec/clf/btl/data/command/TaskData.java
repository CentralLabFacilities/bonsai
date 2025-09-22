package de.unibi.citec.clf.btl.data.command;


import de.unibi.citec.clf.btl.Type;
import java.util.Objects;

/**
 *
 * @author skoester
 */
@Deprecated
public class TaskData extends Type {
    
    private String task = "task";
    private String action = "action";
    private String object = "object";

    private int id = 0;
    private int textpos = 0;
    private int occ = 0;
    
    
    /**
     * 
     * @param task 
     */
    public void setTask(String task) {
        this.task = task;
    }

    
    /**
     * 
     * @param id 
     */
    public void setId(int id) {
        this.id = id;
    }

    
    /**
     * 
     * @return 
     */
    public String getTask() {
        return task;
    }

    
    /**
     * 
     * @return 
     */
    public int getId() {
        return id;
    }
    
    
    /**
     * 
     * @param object 
     */
    public void setObject(String object) {
        this.object = object;
    }

    /**
     * 
     * @param textpos 
     */
    public void setTextpos(int textpos) {
        this.textpos = textpos;
    }
    
    
    /**
     * 
     * @return 
     */
    public String getObject() {
        return object;
    }

    /**
     * 
     * @return 
     */
    public int getTextpos() {
        return textpos;
    }
    
    
    /**
     * @return 
     */
    public String getAction() {
        return action;
    }

    
    /**
     * @param action 
     */
    public void setAction(String action) {
        this.action = action;
    }

    /**
     * 
     * @param occ 
     */
  public void setOcc(int occ) {
        this.occ = occ;
    }

  /**
   * 
   * @return 
   */
    public int getOcc() {
        return occ;
    }

    @Override
    public int hashCode() {
        int hash = 5;
        hash = 59 * hash + Objects.hashCode(this.task);
        hash = 59 * hash + Objects.hashCode(this.action);
        hash = 59 * hash + Objects.hashCode(this.object);
        hash = 59 * hash + this.id;
        hash = 59 * hash + this.textpos;
        hash = 59 * hash + this.occ;
        return hash;
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null) {
            return false;
        }
        if (getClass() != obj.getClass()) {
            return false;
        }
        final TaskData other = (TaskData) obj;
        
        if(Objects.hashCode(this) != Objects.hashCode(other)) {
            return false;
        }
        
        if (this.id != other.id) {
            return false;
        }
        if (this.textpos != other.textpos) {
            return false;
        }
        if (this.occ != other.occ) {
            return false;
        }
        if (!Objects.equals(this.task, other.task)) {
            return false;
        }
        if (!Objects.equals(this.action, other.action)) {
            return false;
        }
        if (!Objects.equals(this.object, other.object)) {
            return false;
        }
        return true;
    }
    
    
    
   
}
