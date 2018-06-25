package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.btl.Type.NoSourceDocumentException;
import de.unibi.citec.clf.btl.data.speechrec.GrammarNonTerminal;
import de.unibi.citec.clf.btl.data.speechrec.GrammarSymbol;
import de.unibi.citec.clf.btl.data.speechrec.GrammarTree;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import de.unibi.citec.clf.btl.data.speechrec.UtterancePart;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import org.apache.log4j.Logger;

/**
 * Simple helper class for working with speech recognition.
 *
 * @author lkettenb, lruegeme
 */
public class SimpleSpeechHelper implements SensorListener<Utterance> {

    /**
     * Implement this interface if you want to scan the grammar tree and
     * match/compare its symbols with whatever you want.
     */
    public interface MatchGrammarSymbol {

        /**
         * Match the given {@link GrammarSymbol} with whatever you want. Return
         * true if it is accepted, false otherwise.
         *
         * @param s Any symbol from the current grammar tree.
         * @return True if this symbol is accepted, false otherwise.
         */
        boolean match(GrammarSymbol s);
    }
    /**
     * Default timeout when reading sensor.
     */
    private static final long DEFAULT_TIMEOUT = 3000;
    /**
     * The logger.
     */
    public static Logger logger = Logger.getLogger(SimpleSpeechHelper.class);
    /**
     * Speech sensor that is used by this instance;
     */
    protected Sensor<Utterance> speechSensor;
    protected LinkedList<Utterance> utteranceBuffer = new LinkedList<>();
    private final Object utteranceBufferLock = new Object();
    private boolean hasNewUnderstandings = false;

    /**
     * Construct a new {@link SimpleSpeechHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @deprecated use {@link #SimpleSpeechHelper(Sensor, boolean)} instead.
     */
    @Deprecated
    public SimpleSpeechHelper(Sensor<Utterance> speechSensor) {
        this.speechSensor = speechSensor;
    }

    /**
     * Construct a new {@link SimpleSpeechHelper} instance.
     *
     * @param speechSensor Speech recognition sensor that should be used.
     * @param clearSensor clear sensor on construction
     */
    public SimpleSpeechHelper(Sensor<Utterance> speechSensor, boolean clearSensor) {
        this.speechSensor = speechSensor;
        if (speechSensor != null) {
            speechSensor.addSensorListener(this);

            if (clearSensor) {
                speechSensor.clear();
            }
        }
    }

    /**
     * Scans the current grammar tree and returns all {@link GrammarSymbol}s
     * that match the given {@link MatchGrammarSymbol#match(GrammarSymbol) }
     * function.
     *
     * @return List of {@link GrammarSymbol}s that matched.
     */
    protected List<GrammarSymbol> scan(MatchGrammarSymbol m) {
        List<GrammarSymbol> list = new ArrayList<GrammarSymbol>();
        synchronized (utteranceBufferLock) {
            for (Utterance u : utteranceBuffer) {
                List<GrammarSymbol> l = scan(u.getGrammarTree(), m);
                list.addAll(l);
            }
            hasNewUnderstandings = false;
        }
        return list;
    }

    /**
     * Scans the current grammar tree and returns all {@link GrammarSymbol}s
     * that match the given
     *
     * @return
     */
    protected List<GrammarSymbol> scan(GrammarSymbol tree, MatchGrammarSymbol m) {
        List<GrammarSymbol> l = new ArrayList<>();
        scanRecursive(tree, m, l);
        return l;
    }

    /**
     * Match s with m. On success add s to l. Call method recursively for all
     * sub-symbols of s.
     *
     * @param s The root grammar symbol.
     * @param m The method to match symbols with.
     * @param l Result list.
     */
    private static void scanRecursive(GrammarSymbol s, MatchGrammarSymbol m,
            List<GrammarSymbol> l) {
        if (s != null) {
            if (m.match(s)) {
                l.add(s);
            }
            if (!s.isTerminal()) {
                GrammarNonTerminal nt = (GrammarNonTerminal) s;
                //logger.debug("symbol " + nt.getName() + " has " + nt.getSubsymbols().size() + " subsymbols");
                for (GrammarSymbol subS : nt.getSubsymbols()) {
                    scanRecursive(subS, m, l);
                }
            }
        }
    }

    /**
     * Find and return the sub-tree where the given grammar non-terminal is the
     * root.
     *
     * @param nt Grammar non-terminal that is equal to the new root.
     * @return A sub-tree with a root node equal to the given non-terminal.
     */
    public GrammarNonTerminal getSubTree(final GrammarNonTerminal nt) {
        List<GrammarSymbol> l = scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                return nt.equals(s);
            }
        });
        if (l.isEmpty()) {
            return null;
        }
        return (GrammarNonTerminal) l.get(0);
    }

    /**
     * Find and return the sub-tree where the given grammar non-terminal name is
     * the name of the sub-trees root node.
     *
     * @param nt Name of the grammar non-terminal that is equal to the new root.
     * @return A sub-tree with a root node name equal to the given name.
     */
    public GrammarNonTerminal getSubTree(final String grammarNonTerminal) {
        List<GrammarSymbol> l = scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (!s.isTerminal()) {
                    GrammarNonTerminal nt = (GrammarNonTerminal) s;
                    if (nt.getName().equals(grammarNonTerminal)) {
                        return true;
                    }
                }
                return false;
            }
        });
        if (l.isEmpty()) {
            return null;
        }
        return (GrammarNonTerminal) l.get(0);
    }

    /**
     * Defines a list of GrammarSymbols and returns the GrammarSymbol with the
     * given id. Returns null if the list is empty or the id is not given in the
     * list.
     *
     * @param grammarNonTerminal Name of the GrammarNonTerminal that is equal to
     * the given root.
     * @param id id of the GrammarTree that should be returned.
     * @return A sub-tree where the root node is named equally to the string and
     * the given id.
     */
    public GrammarNonTerminal getSubTreeN(final String grammarNonTerminal, int id) {
        List<GrammarSymbol> l = scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (!s.isTerminal()) {
                    GrammarNonTerminal nt = (GrammarNonTerminal) s;
                    if (nt.getName().equals(grammarNonTerminal)) {
                        return true;
                    }
                }
                return false;
            }
        });
        if (l.isEmpty()) {
            return null;
        }
        return (GrammarNonTerminal) l.get(id);
    }

    /**
     * Find and return the sub-tree where the given grammar non-terminal name is
     * the name of the sub-trees root node.
     *
     * @param nt Name of the grammar non-terminal that is equal to the new root.
     * @return A sub-tree with a root node name equal to the given name.
     */
    public List<GrammarNonTerminal> getSubTrees(final String grammarNonTerminal) {

        List<GrammarSymbol> l = scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (!s.isTerminal()) {
                    GrammarNonTerminal nt = (GrammarNonTerminal) s;
                    if (nt.getName().equals(grammarNonTerminal)) {
                        return true;
                    }
                }
                return false;
            }
        });

        List<GrammarNonTerminal> list = new ArrayList<>();
        for (GrammarSymbol s : l) {
            list.add((GrammarNonTerminal) s);
        }
        return list;

    }

    /**
     * Wait until the system understood something.
     *
     * @param timeout Timeout in milliseconds.
     * @return True on success, false otherwise.
     */
    @Deprecated
    public boolean waitForUnderstanding(long timeout) {

        synchronized (utteranceBufferLock) {
            logger.debug("clear buffer");
            utteranceBuffer.clear();
        }
        speechSensor.clear();

        long startTime = System.currentTimeMillis();

        while (System.currentTimeMillis() - startTime < timeout) {

            boolean newDataAvailable = false;
            while (speechSensor.hasNext()) {
                Utterance newData;
                ////////

                //////
                try {
                    newData = speechSensor.readLast(100);
                    if (newData == null) {
                        continue;
                    }

                    synchronized (utteranceBufferLock) {
                        utteranceBuffer.add(newData);
                        newDataAvailable = true;
                    }
                    logger.debug("add to buffer: " + newData.getSimpleString()
                            + "\n" + newData.getSourceDocument());
                } catch (IOException e) {
                    logger.error("IO Error: " + e.getMessage());
                    logger.debug(e);
                    break;
                } catch (InterruptedException e) {
                    logger.error("Interrupted: " + e.getMessage());
                    logger.debug(e);
                    break;
                } catch (NoSourceDocumentException e) {
                    logger.warn("No source document");
                }
            }

            if (newDataAvailable) {
                logger.debug("buffer has data. size: " + utteranceBuffer.size());
                return true;
            }

            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                logger.warn("Interrupted");
            }
        }
        return false;

    }

    /**
     * Wait until the system understood something. Uses a default timeout.
     *
     * @see SimpleSpeechHelper#DEFAULT_TIMEOUT
     *
     * @return True on success, false otherwise.
     */
    @Deprecated
    public boolean waitForUnderstanding() throws IOException {
        return waitForUnderstanding(DEFAULT_TIMEOUT);
    }

    /**
     * Returns a list with all understood words.
     *
     * @return A list with all understood words.
     */
    public List<String> getAllUnderstoodWords() {
        final List<String> result = new ArrayList<String>();
        scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (s.isTerminal()) {
                    UtterancePart up = (UtterancePart) s;
                    result.add(up.getWord());
                    return true;
                }
                return false;
            }
        });

        return result;
    }

    /**
     * Get all words as an ordered set, that triggered the given non terminal.
     *
     * @param nonTerminal The name of the non-terminal symbol.
     * @return A {@link List} of all words, that were found under the given
     * non-terminal symbol.
     */
    public Set<String> getUnderstoodWords(String nonTerminal) {

        List<GrammarNonTerminal> subTrees = getSubTrees(nonTerminal);

        final Set<String> result = new HashSet<>();

        for (GrammarNonTerminal subTree : subTrees) {
            scan(subTree, new MatchGrammarSymbol() {
                @Override
                public boolean match(GrammarSymbol s) {
                    if (s.isTerminal()) {
                        UtterancePart up = (UtterancePart) s;
                        result.add(up.getWord());
                        return true;
                    }
                    return false;
                }
            });
        }

        return result;
    }
    
    
    /**
     * Get all words as List, that triggered the given non terminal.
     *
     * @param nonTerminal The name of the non-terminal symbol.
     * @return A {@link List} of all words, that were found under the given
     * non-terminal symbol.
     */
    public List<String> getUnderstoodWordsAsList(String nonTerminal) {

        List<GrammarNonTerminal> subTrees = getSubTrees(nonTerminal);

        final List<String> result = new ArrayList<String>();

        for (GrammarNonTerminal subTree : subTrees) {
            scan(subTree, new MatchGrammarSymbol() {
                @Override
                public boolean match(GrammarSymbol s) {
                    if (s.isTerminal()) {
                        UtterancePart up = (UtterancePart) s;
                        result.add(up.getWord());
                        return true;
                    }
                    return false;
                }
            });
        }

        return result;
    }

    /**
     * Get all terminals as an ordered list of strings, under a given
     * nonterminal.
     *
     * @param nonTerminal The name of the non-terminal symbol.
     * @return A {@link List} of all words, that were found under the given
     * non-terminal symbol.
     */
    public List<String> getSubStrings(GrammarNonTerminal nonTerminal) {

        List<GrammarSymbol> subSymbols =  nonTerminal.getSubsymbols();

        final List<String> result = new ArrayList<String>();

        for (GrammarSymbol subTree : subSymbols) {
            scan(subTree, new MatchGrammarSymbol() {
                @Override
                public boolean match(GrammarSymbol s) {
                    if (s.isTerminal()) {
                        UtterancePart up = (UtterancePart) s;
                        result.add(up.getWord());
                        return true;
                    }
                    return false;
                }
            });
        }

        return result;
    }

    public static String concatenateWords(List<String> l) {
        if (l.isEmpty()) {
            return "";
        }
        String s = l.get(0);
        for (int i = 1; i < l.size(); i++) {
            s += "_" + l.get(i);
        }

        logger.debug("concatenate to: " + s);

        return s;
    }

    /**
     * Get all non-terminals of the last seen current grammar tree.
     *
     * @return List of non-terminal {@link String}s;
     */
    public Set<String> getNonTerminals() {
        final Set<String> result = new HashSet<>();
        scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (!s.isTerminal()) {
                    GrammarNonTerminal nt = (GrammarNonTerminal) s;
                    //logger.debug("getNonTerminals: " + nt.getName());
                    result.add(nt.getName());
                    return true;
                }
                return false;
            }
        });

        return result;
    }

    /**
     * Get a list of all Nonterminals (as <i>GrammarNonTerminal()</i>) of the
     * grammar tree.
     *
     * @return A list of all non-terminals {@link GrammarNonTerminal} of the
     * grammar tree.
     */
    public List<GrammarNonTerminal> getNonTerminalNodes() {
        final List<GrammarNonTerminal> result = new ArrayList<GrammarNonTerminal>();
        scan(new MatchGrammarSymbol() {
            @Override
            public boolean match(GrammarSymbol s) {
                if (!s.isTerminal()) {
                    result.add((GrammarNonTerminal) s);
                    return true;
                }
                return false;
            }
        });

        return result;
    }

    /**
     * Return the root-Node of the last Utterance's grammar tree.
     *
     * @return
     */
    public GrammarNonTerminal getLastTree() {
        synchronized (utteranceBufferLock) {
            return utteranceBuffer.getLast().getGrammarTree();
        }

    }

    public Utterance getLastUtterance(){
        synchronized (utteranceBufferLock) {
            return utteranceBuffer.getLast();
        }
    }
    
    public List<GrammarTree> getAllTrees() {
        synchronized (utteranceBufferLock) {
            LinkedList<GrammarTree> bla = new LinkedList();
            utteranceBuffer.stream().forEach((ut) -> {
                bla.add(ut.getGrammarTree());
        });
            return bla;
        }
    } 

    @Override
    public void newDataAvailable(Utterance utter) {
        synchronized (utteranceBufferLock) {
            logger.debug("got new data: " + utter.getSimpleString());
            logger.debug(utter.getGrammarTree().toString());
            utteranceBuffer.add(utter);
            hasNewUnderstandings = true;
        }
    }

    public void startListening() {
        logger.debug("start listening");
        synchronized (utteranceBufferLock) {
            speechSensor.clear();
            utteranceBuffer.clear();
            hasNewUnderstandings = false;
        }

    }

    public boolean hasNewUnderstanding() {
        return hasNewUnderstandings;
    }

    public void removeHelper() {
        speechSensor.removeSensorListener(this);
    }

    @Override
    protected void finalize() throws Throwable {
        speechSensor.removeSensorListener(this);
        super.finalize();
    }
}
