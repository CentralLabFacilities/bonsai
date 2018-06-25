package de.unibi.citec.clf.btl.data.speechrec;


import java.util.ArrayList;
import java.util.Objects;

import de.unibi.citec.clf.btl.Type;

/**
 * Domain class representing a non terminal symbol within the grammartree of an
 * utterance
 *
 * @author lschilli
 * @author sjebbara
 * @author lkettenb
 */
public class GrammarNonTerminal extends Type implements GrammarSymbol {

    private GrammarSymbol parent = null;
    private String name = "";
    private ArrayList<GrammarSymbol> subsymbols = new ArrayList<>();

    public GrammarNonTerminal() {
    }

    GrammarNonTerminal(String name) {
        setName(name);
    }

    GrammarNonTerminal(String name, GrammarSymbol parent) {
        setName(name);
        this.parent = parent;
    }
    
    public void setSubSymbols(ArrayList<GrammarSymbol> list){
        this.subsymbols = list;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        if(name==null) {
            this.name = "";
        } else {
            this.name = name;
        }
    }

    public GrammarSymbol getSymbol(int index) {
        return subsymbols.get(index);
    }
    
    /**
     * Get all the Terminals directly owned by this GNT. Does not(!) return Terminals in GNT's owned by this GNT.
     * @return a list off all direct terminals this GNT owns.
     * @deprecated use the unbugged getEveryTerminal
     */
    @Deprecated
    public String getAllTerminals() {
        String words = "";
        for(GrammarSymbol s : subsymbols) {
            if (s.isTerminal()) {
                UtterancePart up = (UtterancePart) s;
                words += up.getWord();
            }
        }
        return words;
    }
    
    /**
     * Returns every Terminal owned by this GNT and GNT's this GNT owns. New Version of getAllTerminals.
     * @return a String representing every Terminal found in this GNT.
     */
    public String getEveryTerminal() {
        String words = "";
        for(GrammarSymbol s : getSubsymbols()) {
            if(!words.isEmpty())
                words += " ";
            if (s.isTerminal()) {
                UtterancePart up = (UtterancePart) s;
                words += up.getWord();
            }
            else{
                GrammarNonTerminal gnt = (GrammarNonTerminal) s;
                words += gnt.getEveryTerminal();
            }
        }
        return words;
    }

    @Override
    public void setParent(GrammarSymbol parent) {
        this.parent = parent;
    }

    @Override
    public GrammarSymbol getParent() {
        return parent;
    }

    public int size() {
        return subsymbols.size();
    }

    public void addSymbol(GrammarSymbol sym) {
        subsymbols.add(sym);
    }

    public ArrayList<GrammarSymbol> getSubsymbols() {
        return subsymbols;
    }

    @Override
    public int hashCode() {
        final int prime = 31;
        int result = 1;
        result = prime * result + ((name == null) ? 0 : name.hashCode());
        result = prime * result
                + ((subsymbols == null) ? 0 : subsymbols.hashCode());
        return result;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GrammarNonTerminal)) return false;
        if (!super.equals(o)) return false;
        GrammarNonTerminal that = (GrammarNonTerminal) o;
        return Objects.equals(parent, that.parent) &&
                Objects.equals(name, that.name) &&
                Objects.equals(subsymbols, that.subsymbols);
    }

    @Override
    public String toString() {
        return "GrammarNonTerminal [name=" + name + ", subsymbols="
                + subsymbols + "]";
    }
    
    // /**
    // * {@inheritDoc}
    // */
    // @Override
    // public String toString() {
    // StringBuilder strb = new StringBuilder();
    // strb.append(name + ":\n");
    // for (int i = 0; i < subsymbols.size(); i++) {
    // GrammarSymbol sym = subsymbols.get(i);
    // strb.append(sym + "\n");
    // }
    // return strb.toString();
    // }

    @Override
    public boolean hasParent() {
        return parent != null;
    }

    @Override
    public boolean isTerminal() {
        return false;
    }
}
