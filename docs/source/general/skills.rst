======
Skills
======

.. highlight:: java

Skills are javaclasses, which mine the smallest parts of a statemachine. Each state of the statemachine is able to envoke an instance of a skill.
Combined skills are able to build more complex behaviours, which themselves can be represented as a single state.

Skillparts
----------

Each skill extends AbstractSkill and needs some predefined components:

-  Actuators that will be used
-  Sensors, which informations will be used
-  ExitTokens, that will be returned to the statemachine
-  datamodels and other variables you want to use

The Skill methods gets invoked in the following order

::

    configure -> init -> execute -> end

-  The skill stops if configure throws an exception
-  if init return false the execute method is skipped, ``end(Token.Fatal())`` is then called
-  execute is able to loop until a non loop token is returned

Configuration
-------------

void configure(SkillConfigurator)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Configure is already called, when loading a statemachine, therefore errors can be handled before execution. Here you should handle your exit Tokens and the data get trough the statemachine

Actuators and Sensors
.....................

The usable Actuators and Sensors are usually defined in an bonsai config file and are usable as Javaobjects:

::

    private static final String ACTUATOR_SPEECHACTUATOR = "SpeechActuator";
    private static final String SENSOR_SPEECHSENSORCONFIRM = "SpeechSensorConfirm";

    @Override
    public void configure(SkillConfigurator configurator) {
        speechSensor = configurator.getSensor(SENSOR_SPEECHSENSORCONFIRM, Utterance.class);
        speechActuator = configurator.getActuator(ACTUATOR_SPEECHACTUATOR, SpeechActuator.class);
    }

ExitToken
.........

ExitToken are used to create events after the skill is finished. To make sure all possible exit events are captured in the scxml the tokens have to be requested in the configuration method.

::

    @Override
    public void configure(SkillConfigurator configurator) {
        // request all tokens that you plan to return from other methods
        tokenSuccessPsYes = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_YES));
        tokenSuccessPsNo = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus(PS_NO));
    }

Parameter
.........

Skills are able to read parameter in the configure method

::
    private String KEY_TEXT = "#_KEY"

    public void configure(SkillConfigurator configurator) {
        text = configurator.requestValue(KEY_TEXT);
        blocking = configurator.requestOptionalBool(KEY_BLOCKING, blocking);
    }

- there are different requestTYPE methods for different types ``requestValue()`` reads the value as String.
- Requested parameter have to be given
- You can request Optinal with defaults if the data with the supplied id is not found


SCXML:
We have the option to read the local datamodel of the state that invokes the skill. Example:

.. code-block:: xml

    <state id="SomeSkill">
        <datamodel>
            <data id="#_KEY" expr="'value'" />
        </datamodel>
    </state>

-------------------------------------------------------------------------------

Methods
-------

boolean init()
~~~~~~~~~~~~~~

Init initalizes the skill and should be used as a place to define your pre nonlogic structures.

::

        @Override
        public boolean init() {
            speechManager = new SimpleSpeechHelper(speechSensor, true);
            if (timeout > 0) {
                logger.info("using timeout of " + timeout + "ms");
                timeout += System.currentTimeMillis();
            }
            speechManager.startListening();
            logger.debug("simple: " + simpleYesOrNo);
            return true;

        }

ExitToken execute()
~~~~~~~~~~~~~~~~~~~

::

        @Override
        public ExitToken execute() {
            if (timeout > 0) {
                if (System.currentTimeMillis() > timeout) {
                    logger.info("ConfirmYesOrNo timeout");
                    return tokenSuccessPsTimeout;
                }
            }
            if (simpleYesOrNo) {
                // call simple yes or no confirmation
                return simpleYesNo();
            } else {
                // call confirm yes or no with limited number of retries and
                // conformations from robot
                return confirmYesNo();
            }
        }

ExitToken end(ExitToken)
~~~~~~~~~~~~~~~~~~~~~~~~

::

        @Override
        public ExitToken end(ExitToken curToken) {
            speechManager.removeHelper();
            return curToken;
        }

        private ExitToken simpleYesNo() {
            if (!speechManager.hasNewUnderstanding()) {
                return ExitToken.loop();
            }
            if (!speechManager.getUnderstoodWords(NT_YES).isEmpty()) {
                return tokenSuccessPsYes;
            } else if (!speechManager.getUnderstoodWords(NT_NO).isEmpty()) {
                return tokenSuccessPsNo;
            }
            return ExitToken.loop();
        }
