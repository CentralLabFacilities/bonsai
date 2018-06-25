package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.Type;
import java.util.LinkedList;
import java.util.Objects;


/**
 *
 * @author rfeldhans
 */
public class Context extends Type {

    private String lastquestion;
    private LinkedList<? extends BDO> lastquestionSubject;

    public Context() {
        lastquestionSubject = new LinkedList();
    }

    public String getLastquestion() {
        return lastquestion;
    }

    public void setLastquestion(String lastquestion) {
        this.lastquestion = lastquestion;
    }

    public LinkedList<? extends BDO> getLastquestionSubject() {
        return lastquestionSubject;
    }

    public void setLastquestionSubject(LinkedList<? extends BDO> lastquestionSubject) {
        this.lastquestionSubject = lastquestionSubject;
    }

    public String getLastQuestion() {
        return lastquestion;
    }

    public void setLastQuestion(String lastquestion) {
        this.lastquestion = lastquestion;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Context)) return false;
        if (!super.equals(o)) return false;
        Context context = (Context) o;
        return com.google.common.base.Objects.equal(lastquestion, context.lastquestion) &&
                com.google.common.base.Objects.equal(lastquestionSubject, context.lastquestionSubject);
    }

    @Override
    public int hashCode() {
        int hash = 3;
        hash = 89 * hash + Objects.hashCode(this.lastquestion);
        hash = 89 * hash + Objects.hashCode(this.lastquestionSubject);
        return hash;
    }

    @Override
    public String toString() {
        String str = "Context (lastquestion= " + lastquestion + "):[";
        for (BDO cto : lastquestionSubject) {
            str = str + " " + cto.toString();
        }
        return str + "]";
    }

}
