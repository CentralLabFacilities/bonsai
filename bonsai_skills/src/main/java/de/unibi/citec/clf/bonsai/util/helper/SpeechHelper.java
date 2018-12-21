package de.unibi.citec.clf.bonsai.util.helper;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.data.speechrec.GrammarNonTerminal;
import de.unibi.citec.clf.btl.data.speechrec.GrammarSymbol;
import de.unibi.citec.clf.btl.data.speechrec.GrammarTree;
import de.unibi.citec.clf.btl.data.speechrec.Utterance;
import de.unibi.citec.clf.btl.data.speechrec.UtterancePart;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.apache.log4j.Logger;

/**
 * Class for searching special elements of the SpeechInput.
 *
 * @author ttoenige
 * @author lziegler
 * @author sjebbara
 * @author hterhors
 * 
 */
public class SpeechHelper {

    private static final long OBSERVATION_LOOP_SLEEP = 1000;
    public static final int WAIT_PHRASE_SLEEP = 2500; // check steps
    private static final long DEFAULT_TIMEOUT = 3000;
    private static final int ISR_UTT_DB_LOW = 35;
    private static final int ISR_START_DB_LOW = 30;
    public static Logger logger = Logger.getLogger(SpeechHelper.class);
    private Sensor<Utterance> speechSensor;
    private SpeechActuator speechActuator;
    private Map<String, List<String>> allUtterances = new HashMap<String, List<String>>();
    private int counter;
    private GrammarNonTerminal root;
    ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    private Map<String, Set<NonTerminalListener>> listeners = new HashMap<String, Set<NonTerminalListener>>();
    /**
     * A List that contains all NonTerminalSymbols of the Last seen GrammarTree,
     * ordered from left to right.
     */
    private LinkedList<GrammarNonTerminal> nonTerminals = new LinkedList<GrammarNonTerminal>();
    /**
     * Stores all SubNonTerminals of every NT in the tree.
     */
    private Map<GrammarNonTerminal, LinkedList<GrammarNonTerminal>> allSubNonTerminals = new HashMap<GrammarNonTerminal, LinkedList<GrammarNonTerminal>>();
    private GrammarTree lastTree;
    private Utterance lastUtterance;
    private boolean allowMoreKeys = false;
    private String key = "";
    private int keyCounter = 1;
    private String keyParent = "";
    private LinkedList<Map<String, List<String>>> allUtt = new LinkedList<Map<String, List<String>>>();
    private boolean pirateMode = false;
//    private IsrActuator isrActuator;
    private String[] waitPhrases = {"I am so alone here", "Someone there?",
    "Did you forget me?"};
    
    public SpeechHelper(Sensor<Utterance> speechSensor,
            SpeechActuator speechActuator) {
        this.speechSensor = speechSensor;
        this.speechActuator = speechActuator;
    }

    /**
     * Constructor
     *
     * @param speechSensor
     */
    public SpeechHelper(Sensor<Utterance> speechSensor,
            SpeechActuator speechActuator, String key, String keyParent) {
        this.speechSensor = speechSensor;
        this.speechActuator = speechActuator;
        this.allowMoreKeys = true;
        this.key = key;
        this.keyParent = keyParent;
        
        // Nobody needs this!
//        logger.debug("Starting observation thread");
//        scheduler.scheduleAtFixedRate(new Runnable() {
//
//            @Override
//            public void run() {
//                observeSensor();
//            }
//        }, 0, OBSERVATION_LOOP_SLEEP, TimeUnit.MILLISECONDS);
    }

    private void scanRecursive(GrammarSymbol currentNode) {
        nonTerminals = new LinkedList<GrammarNonTerminal>();
        scanRecursive(currentNode, new LinkedList<String>(),
                new LinkedList<GrammarNonTerminal>());
        //logger.info("SubNTs: " + allSubNonTerminals);
    }

    /**
     * search all UtteranceParts
     *
     * @param currentNode
     */
    @SuppressWarnings("unchecked")
    private void scanRecursive(GrammarSymbol currentNode,
            LinkedList<String> parents, LinkedList<GrammarNonTerminal> parentNTs) {
        if (parents == null) {
            logger.info("reset nt list");
            nonTerminals = new LinkedList<GrammarNonTerminal>();
            parents = new LinkedList<String>();
            parentNTs = new LinkedList<GrammarNonTerminal>();
        }
        if (currentNode instanceof GrammarNonTerminal) {
            GrammarNonTerminal nonTerminal = (GrammarNonTerminal) currentNode;
            nonTerminals.add(nonTerminal);
            //logger.info(nonTerminal.getName() + " added to nt List");
            parents.add(nonTerminal.getName());

            for (GrammarNonTerminal parent : parentNTs) {

                GrammarNonTerminal newKey = parent;

                if (allSubNonTerminals.containsKey(newKey)) {

                    allSubNonTerminals.get(newKey).add(nonTerminal);

                } else {

                    LinkedList<GrammarNonTerminal> nts = new LinkedList<GrammarNonTerminal>();
                    nts.add(nonTerminal);
                    allSubNonTerminals.put(newKey, nts);

                }

            }
            parentNTs.add(nonTerminal);
            for (int i = 0; i < nonTerminal.size(); i++) {
                scanRecursive(nonTerminal.getSymbol(i),
                        (LinkedList<String>) parents.clone(),
                        (LinkedList<GrammarNonTerminal>) parentNTs.clone());

            }

        } else {
            String word = ((UtterancePart) currentNode).getWord();

            for (String parent : parents) {

                String newKey = parent;

                if (allUtterances.containsKey(newKey)) {

                    allUtterances.get(newKey).add(word);

                } else {

                    LinkedList<String> words = new LinkedList<String>();
                    words.add(word);
                    allUtterances.put(newKey, words);

                }

            }
        }

        // logging
        String msg = "Found Utterances:\n";
        for (String parent : allUtterances.keySet()) {
            msg += "\t[" + parent + "] -> " + allUtterances.get(parent) + "\n";
        }
        // logger.debug(msg);
    }

    /**
     * Get the information if the robot understand something.
     *
     * @return
     * <code>true</code> if the robot understand something,
     * <code>false</code> if not
     */
    private boolean understandSomething() {

        if (!speechSensor.hasNext()) {
            return false;
        }
        allUtterances.clear();
        try {
            lastUtterance = speechSensor.readLast(1000);
            if (lastUtterance==null) {
                logger.fatal("speechSensor timed out (1000ms) returning false");
                return false;
            }
            lastTree = lastUtterance.getGrammarTree();

            if (lastTree == null) {
                return false;
            }

            System.out.println("tree size " + lastTree.size());
            System.out.println("tree " + lastTree.toString());

            if (!allowMoreKeys) {
                startParsing(lastTree);
                return true;
            }

            allUtt = new LinkedList<Map<String, List<String>>>();

            if (!isTreeComplete(lastTree, keyParent)) {
                //logger.info("incomplet Tree - start Parsing " + lastTree);
                startParsing(lastTree);
                return true;
            }

            if (lastTree.size() == 0) {
                return false;
            }

            //logger.info("getSubTree " + lastTree);
            GrammarNonTerminal subTree = getSubTree(lastTree);
            //logger.info("found tree " + subTree);
            startParsing(subTree);

            return true;

        } catch (IOException e) {
            logger.error("IOException" + e);

        } catch (InterruptedException ex) {
            logger.error("Interrupted");
        }
        return false;
    }
    
    public GrammarNonTerminal getSubTree(GrammarNonTerminal tree) {
        if (tree.size() > 1) {
            return tree;
        }
        GrammarSymbol symbol = tree.getSymbol(0);
        
        if (symbol instanceof GrammarNonTerminal) {
            GrammarNonTerminal nonTerminal = (GrammarNonTerminal) symbol;
            String name = nonTerminal.getName();
            if (name.equals(key) || name.equals(keyParent)) {
                return getSubTree(nonTerminal);
            }
            return nonTerminal;
        }
        return tree;
    }

    private boolean isTreeComplete(GrammarNonTerminal tree, String key) {

        if (tree.size() != 1) {
            return false;
        }

        GrammarSymbol symbol = lastTree.getSymbol(0);
        if (symbol instanceof GrammarNonTerminal) {
            GrammarNonTerminal nonTerminal = (GrammarNonTerminal) symbol;
            if (nonTerminal.getName().equals(key)) {
                return true;
            }
        }
        return false;
    }

    public void setWaitPhrases(String[] waitPhrases) {
    	this.waitPhrases = waitPhrases;
    }

    public String getWaitPhrase() {
        return this.waitPhrases[new Random().nextInt(this.waitPhrases.length)];
    }

    private void startParsing(GrammarNonTerminal tree) {

        for (int i = 0; i < tree.size(); i++) {

            GrammarSymbol symbol = tree.getSymbol(i);
            scanRecursive(symbol);
            if (allowMoreKeys && allUtterances.size() > 0) {
                allUtt.add(new HashMap<String, List<String>>(allUtterances));
                allUtterances.clear();
            }
        }
    }

    /**
     * This method reads and scans data from the {@link SpeechSensor}. It should
     * be called scheduled at a fixed rate for a constant speech detection.
     */
    private void observeSensor() {

        if (!listeners.isEmpty()) {

            try {
                logger.debug("waiting for understanding " + listeners.keySet());
                waitForUnderstandingCleared(false);
                Set<String> set = getNonTerminals();

                logger.debug("Understood something");

                for (String nonTerminal : listeners.keySet()) {
                    if (allowMoreKeys) {
                        for (String nonT : set) {
                            if (nonT.contains(nonTerminal)
                                    && listeners.get(nonTerminal) != null) {
                                Set<NonTerminalListener> listenersSet = new HashSet<NonTerminalListener>();
                                listenersSet.addAll(listeners.get(nonTerminal));

                                logger.debug("Understood: " + nonTerminal);

                                for (NonTerminalListener l : listenersSet) {
                                    l.processNonTerminal();
                                }
                            }
                        }

                    } else {
                        if (set.contains(nonTerminal)
                                && listeners.get(nonTerminal) != null) {
                            Set<NonTerminalListener> listenersSet = new HashSet<NonTerminalListener>();
                            listenersSet.addAll(listeners.get(nonTerminal));

                            logger.debug("Understood: " + nonTerminal);

                            for (NonTerminalListener l : listenersSet) {
                                logger.debug("call " + l);
                                l.processNonTerminal();
                                logger.debug("remove " + l);
                                removeNonTerminalListener(l, nonTerminal);
                            }
                        }
                    }
                }
            } catch (IOException e) {
                logger.error("IOException in SpeechSensor");
            }
        }
    }

    /**
     * Wait for some input (to get the list use the getter). Uses the default
     * timeout of 3 seconds.
     *
     * <br/> <b>!!NOTE:</b> Maybe you should call clear() first to avoid
     * "hearing" old input.
     *
     * @param usePhrase If
     * <code>true</code>, the robot will say waiting phrases.
     * @see SpeechHelper#clear
     */
    public boolean waitForUnderstandingCleared(boolean usePhrase)
            throws IOException {
        return waitForUnderstanding(usePhrase, WAIT_PHRASE_SLEEP,
                DEFAULT_TIMEOUT);
    }

    /**
     *
     */
    public boolean waitForUnderstanding(boolean usePhrase)
            throws IOException {
        return waitForUnderstanding(usePhrase, WAIT_PHRASE_SLEEP,
                DEFAULT_TIMEOUT);
    }

    /**
     * Clears the current speechSensor. Should be called once, before calling
     * waitForUnderstanding
     *
     * @see SpeechHelper#waitForUnderstanding
     */
    public void clear() {
        while (speechSensor.hasNext()) {
            try {
                speechSensor.readLast(10);
            } catch (InterruptedException e) {
                e.printStackTrace();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
    }

    // /**
    // * Wait for some input (to get the list use the getter).
    // *
    // * <b>!!NOTE: NO AUTO CLEAR FOR THE CURRENT SPEECHSENSOR!!</b> that can
    // * trigger problems with fast repeating sentences
    // *
    // * @param usePhrase
    // * If <code>true</code>, the robot will say waiting phrases.
    // * @param waitSteps
    // * Number of check loops that trigger waiting phrases.
    // * @throws IOException
    // * Is thrown by the {@link SpeechActuator}, if an error occurred
    // * while saying something.
    // * @see SpeechManager#clearSpeechManager
    // * @see SpeechManager#waitForUnderstandingCleared
    // */
    // public boolean waitForUnderstandingUnCleared(boolean usePhrase,
    // int waitSteps, long timeout) throws IOException {
    // counter = 0;
    // keyCounter = 1;
    // long startTime = Time.currentTimeMillis();
    // while (!understandSomething()) {
    // if (counter == waitSteps) {
    // if (usePhrase) {
    // speechActuator.say(getWaitPhrase());
    // }
    // counter = 0;
    // }
    // counter++;
    //
    // if (startTime + timeout < Time.currentTimeMillis()) {
    // return false;
    // }
    //
    // keyCounter = 1;
    // }
    // return true;
    // }
    /**
     * Wait for some input (to get the list use the getter).
     *
     * <br/> <b>!!NOTE:</b> Maybe you should call clear() first to avoid
     * "hearing" old input.
     *
     * @param usePhrase If
     * <code>true</code>, the robot will say waiting phrases.
     * @param waitSteps Number of check loops that trigger waiting phrases.
     * @throws IOException Is thrown by the {@link SpeechActuator}, if an error
     * occurred while saying something.
     * @see SpeechHelper#clear
     */
    public boolean waitForUnderstanding(boolean usePhrase, long phraseTimeout,
            long timeout) throws IOException {
        // Will be done by SaySrv automatically
//        isrActuator.setThresholds(ISR_START_DB_LOW, ISR_UTT_DB_LOW);
        long startTime = Time.currentTimeMillis();
        long lastPhraseTime = startTime;
        while (!understandSomething()) {
        	long currentTime = Time.currentTimeMillis();
            if (usePhrase && currentTime - lastPhraseTime > phraseTimeout) {
                speechActuator.say(getWaitPhrase());
                lastPhraseTime = Time.currentTimeMillis();
            }

            if (currentTime - startTime > timeout) {
                return false;
            }
        }
        return true;
    }

    /**
     * Wait for some input (to get the list use the getter).
     *
     * <br/> <b>!!NOTE:</b> Maybe you should call clear() first to avoid
     * "hearing" old input.
     *
     * @param timeout Timeout
     * @throws IOException Is thrown by the {@link SpeechActuator}, if an error
     * occurred while saying something.
     * @see SpeechHelper#clear
     */
    public boolean waitForUnderstanding(long timeout) throws IOException {
        // Will be done by SaySrv automatically
//        isrActuator.setThresholds(ISR_START_DB_LOW, ISR_UTT_DB_LOW);
        long startTime = Time.currentTimeMillis();
        while (!understandSomething()) {
            if (startTime + timeout < Time.currentTimeMillis()) {
                return false;
            }
        }
        return true;
    }

    // /**
    // * Wait for some input (to get the list use the getter).
    // *
    // * @param usePhrase
    // * If <code>true</code>, the robot will say waiting phrases.
    // * @param waitSteps
    // * Number of check loops that trigger waiting phrases.
    // * @throws IOException
    // * Is thrown by the {@link SpeechActuator}, if an error occurred
    // * while saying something.
    // */
    // public boolean waitForUnderstandingCleared(boolean usePhrase, int
    // waitSteps)
    // throws IOException {
    // counter = 0;
    // keyCounter = 1;
    // while (true) {
    // try {
    // System.out.println("read");
    // if (speechSensor.readLast(100) == null)
    // break;
    // } catch (InterruptedException e) {
    // logger.warn(e.getMessage());
    // return false;
    // }
    // }
    // System.out.println("ready");
    // while (!understandSomething()) {
    // if (counter == waitSteps) {
    // if (usePhrase) {
    // speechActuator.say(getWaitPhrase());
    // }
    // counter = 0;
    // }
    // counter++;
    // }
    // return true;
    // }
    /**
     * Get all words of the last seen GrammarTree in the correct order.
     *
     * @return List of Utterances-{@link String}
     */
    public List<String> getAllUnderstoodWords() {

        LinkedList<String> words = new LinkedList<String>();

        for (UtterancePart word : lastUtterance) {
            words.add(word.getWord());
        }

        return words;
    }
    
    public List<String> getAllUnderstoodWords(GrammarNonTerminal gmt) {
        LinkedList<String> words = new LinkedList<String>();
        
        
        return words;
    }

    /**
     * Get all words as an ordered list, that triggered the given non terminal.
     *
     * @param nonTerminal The name of the non-terminal symbol.
     * @return A {@link List} of all words, that were found under the given
     * non-terminal symbol.
     */
    public List<String> getUnderstoodWords(String nonTerminal) {

        List<String> utterances = allUtterances.get(nonTerminal);
        if (utterances == null) {
            utterances = new LinkedList<String>();
        }
        return utterances;
    }

    /**
     * Get all non-termials of the last seen GrammarTree.
     *
     * @return List of non-terminal {@link String}s;
     */
    public Set<String> getNonTerminals() {
        if (allowMoreKeys) {

            Set<String> retSet = null;

            for (Map<String, List<String>> map : allUtt) {
                if (retSet == null) {
                    retSet = map.keySet();
                } else {
                    retSet.addAll(map.keySet());
                }
            }

            if (retSet == null) {
                retSet = new HashSet<String>();
            }

            return retSet;

        } else {
            return allUtterances.keySet();
        }
    }

    public Map<String, List<String>> getAllUtterances() {
        return new HashMap<String, List<String>>(allUtterances);
    }

    public void addNonTerminalListener(NonTerminalListener l, String nonTerminal) {

        if (listeners.containsKey(nonTerminal)) {

            listeners.get(nonTerminal).add(l);

        } else {

            Set<NonTerminalListener> set = new HashSet<NonTerminalListener>();
            set.add(l);
            listeners.put(nonTerminal, set);
        }
    }

    public void removeNonTerminalListener(NonTerminalListener l,
            String nonTerminal) {

        if (listeners.containsKey(nonTerminal)) {

            logger.debug("removing listener " + l.getClass().getName());
            Set<NonTerminalListener> set = listeners.get(nonTerminal);
            set.remove(l);

            if (set.isEmpty()) {
                logger.debug("removing non terminal '" + nonTerminal + "'");
                listeners.remove(nonTerminal);
            }

        } else {
            logger.error("non terminal not found");
        }
    }

    // public void say(String text) throws IOException {
    // speechActuator.say(text);
    //
    // }
    //
    // public void say(String text, boolean async) throws IOException {
    // speechActuator.say(text, async);
    // }
    //
    // public void sayAccentuated(String phrase) throws IOException {
    // if (pirateMode) {
    // speechActuator.sayAccentuated(phrase + "Arr!");
    // } else {
    // speechActuator.sayAccentuated(phrase);
    // }
    // }
    //
    // public void sayAccentuated(String phrase, boolean async) throws
    // IOException {
    // speechActuator.sayAccentuated(phrase, async);
    // }
    //
    // public void sayAccentuated(String phrase, boolean async,
    // String prosodyConfig) throws IOException {
    // speechActuator.sayAccentuated(phrase, async, prosodyConfig);
    // }
    //
    // public void sayAccentuated(String phrase, String prosodyConfig)
    // throws IOException {
    // speechActuator.sayAccentuated(phrase, prosodyConfig);
    // }
    public interface NonTerminalListener {

        public void processNonTerminal();
    }

    public LinkedList<Map<String, List<String>>> getAllUtt() {
        return allUtt;
    }

    /**
     * Get a list of all Nonterminals (as <i>GrammarNonTerminal()</i>) of the
     * grammar tree.
     *
     * @return
     */
    public LinkedList<GrammarNonTerminal> getNonTerminalNodes() {
        return nonTerminals;
    }

    /**
     * Get a list of Nonterminals (as <i>GrammarNonTerminal()</i>) of the
     * grammar tree with the specified name. Same as <i>
     * getAllChildrenByName()</i> but starting at the root node.
     *
     * @param nonTerminalName
     * @return A list of Nodes with the given name
     */
    public LinkedList<GrammarNonTerminal> getNonTerminalNodes(
            String nonTerminalName) {
        LinkedList<GrammarNonTerminal> list = new LinkedList<GrammarNonTerminal>();
        for (GrammarNonTerminal x : nonTerminals) {
            if (x.getName().equals(nonTerminalName)) {
                list.add(x);
            }
        }
        return list;
    }

    /**
     * Get a list of Nonterminals of the grammar tree with one of the specified
     * names. Same as {@link getAllChildrenByName} but starting at the root
     * node.
     *
     * @param nonTerminalName An array of names
     * @return A list of Nodes which matches one of the given names
     */
    public LinkedList<GrammarNonTerminal> getNonTerminalNodes(
            String[] nonTerminalNames) {
        LinkedList<GrammarNonTerminal> list = new LinkedList<GrammarNonTerminal>();
        for (GrammarNonTerminal x : nonTerminals) {
            for (String name : nonTerminalNames) {
                if (x.getName().equals(name)) {
                    list.add(x);
                    break;
                }
            }
        }
        return list;
    }

    /**
     * Returns a list of GrammarNonTerminal which are descendants of the
     * root-node and have the name <i>name</i>.
     *
     * @param name
     * @return
     */
    public List<GrammarNonTerminal> getAllChildrenByName(
            GrammarNonTerminal root, String name) {
        List<GrammarNonTerminal> children = new ArrayList<GrammarNonTerminal>();
        // TODO Variablen vllt überschrieben
		/*
         * scanRecursive überschreibt die bisherigen variablen, das bedeutet das
         * der aufruf dieser funktion möglicherweise den speechmanager ändert
         * und nicht mehr das ursprünglich gehörte in den variablen steht.
         */
        if (allSubNonTerminals.isEmpty()) {
            System.out.println("-------------------------------");

            scanRecursive(root);
        }

        LinkedList<GrammarNonTerminal> subNTsOfNode = allSubNonTerminals.get(root);
        if (subNTsOfNode != null) {
            for (GrammarNonTerminal x : allSubNonTerminals.get(root)) {
                if (x.getName().equals(name)) {
                    children.add(x);
                }
            }
        }
        return children;

    }

    /**
     * Returns a list of GrammarNonTerminal which are descendants of the
     * root-node and have one of the names in <i>nonTerminalNames</i>.
     *
     * @param name
     * @return
     */
    public List<GrammarNonTerminal> getAllChildrenByName(
            GrammarNonTerminal root, String[] nonTerminalNames) {
        List<GrammarNonTerminal> children = new ArrayList<GrammarNonTerminal>();

        // TODO wie oben
        if (allSubNonTerminals.isEmpty()) {
            scanRecursive(root);
        }
        LinkedList<GrammarNonTerminal> subNTsOfNode = allSubNonTerminals.get(root);
        if (subNTsOfNode != null) {
            for (GrammarNonTerminal x : subNTsOfNode) {
                for (String name : nonTerminalNames) {
                    if (x.getName().equals(name)) {
                        children.add(x);
                        break;
                    }
                }
            }
        }
        return children;

    }
    
    public List<GrammarNonTerminal> getdirectChildrenByName(GrammarNonTerminal root, String name) {
        List<GrammarNonTerminal> children = new ArrayList<GrammarNonTerminal>();
//        if (allSubNonTerminals.isEmpty()) {
//            scanRecursive(root);
//        }
        LinkedList<GrammarNonTerminal> subNTsOfNode = allSubNonTerminals.get(root);
        if (subNTsOfNode != null) {
            for (GrammarNonTerminal x : subNTsOfNode) {
                if (x.getName().equals(name)) {
                    children.add(x);
                }
            }
        }
        return children;
    }

    /**
     * Parses a grammar tree with <i>tree</i> as the start symbol as if it was
     * heard by the SpeechSensor. Overrides all previously heared speech-stuff.
     *
     * @param tree to be parsed
     */
    public void scanNode(GrammarNonTerminal tree) {
        startParsing(tree);
    }

    /**
     * Return the root-Node of the last Utterance's grammar tree.
     *
     * @return
     */
    public GrammarNonTerminal getLastTree() {
        return lastTree;
    }

    /**
     * Given a List of NonTerminals this method returns a list of the names of
     * these NonTerminals.
     *
     * @param nodes
     * @return
     */
    public List<String> getListOfNames(List<GrammarNonTerminal> nodes) {
        List<String> list = new ArrayList<String>();
        for (GrammarNonTerminal g : nodes) {
            list.add(g.getName());
        }
        return list;
    }

    public void switchPiratemode() {
        pirateMode = !pirateMode;
    }
}
