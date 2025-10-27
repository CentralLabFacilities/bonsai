.. _section_skills:

Skills
======

.. highlight:: java

.. quote:: 

   "A skill describes a combinable and reusable stateful building block of a robot behavior that covers one desired outcome (minimal) by only facilitating the frameworks sensors and actuators."

Skills execute code using :ref:`sensors <section_sensor>` and :ref:`actuators <section_actuator>` and finish with one defined :ref:`ExitStatus <section_exit_token>`. 
They can use additional input/output with :ref:`slots <section_memory>`.
Furthermore, :ref:`parameters <section_parameter>` can be directly provided via the SCXML state machine.

.. note:: 

    - Sensors, Actuators, Slots, and parameters all can be requested through the :ref:`SkillConfigurator <section_skill_configurator>`.
    - Sensors and Actuators are defined in the :ref:`Bonsai config <section_config>`.
    - Slot definitions and Parameters are configured inside the :ref:`behavior modelling <section_scxml>`.

Functions
---------

Each skill *must* contain the following functions:

.. list-table:: Skill Functions
   :widths: 20 60 20
   :header-rows: 1

   * - Function
     - Explanation
     - Note
   * - configure()
     - | Configures the Sensor and Actuator  
       | from the Bonsai config  and slots and 
       | parameters from the behavior model.
     - | For more infos on skill configurations 
       | see :ref:`here <section_skill_configurator>`.
       | The skill stops if configure throws and 
       | exception
   * - init()
     - | init() initalizes the skill and should be used as 
       | a place to define your pre nonlogic structures  
     - | If init returns false, the execute method is
       | skipped, ``end(Token.Fatal())`` is then called
   * - execute()
     - | Gather data from sensors and slots and do  
       | some actions (possibly with actuators).
       | The execute function is repeatedly called
       | (returns Loop-Token) until a non loop token
       | is returned
     - | Actuators usually return a Future object. 
       | The execute function should wait until the 
       | action is done and we can get a result from
       | the Future object.
   * - end()
     - End the skill.
     - 


The Skill methods gets invoked in the following order

::

    configure -> init -> execute -> end

.. _section_skill_configurator:

SkillConfigurator
-----------------

Skills utilize the ``SkillConfigurator``. It enables the skill to get:

 - Parameters from the :ref:`robotic behavior code <section_parameters_scxml>`
 - Memory slot configuration from the :ref:`robotic behavior code <section_memory_scxml>`
 - Actuators and Sensors from the Bonsai config

They all can be requested by the configurator using a **specified key**.
The parameter functions and memory slot keys are defined within the skill and configured in the :ref:`robotic behavior code <section_parameters_scxml>`.
The actuator and sensor, however, get their configurations from the **Bonsai config**.

.. note:: 

    For more information on how and where the SkillConfigurator gets the configuration, look up the section :ref:`SkillConfigurator <section_skill_configurator>`.

Configure is already called before during load, therefore errors can be handled before execution.

.. list-table:: SkillConfigurator Functions
   :widths: 15 15
   :header-rows: 1

   * - Function
     - Explanation
   * - requestValue(String key)
     - | From the behavior model, request the parameter 
       | with key and cast it to a String
   * - requestOptionalValue(String key, String default)
     - | From the behavior model, request the parameter 
       | with key and cast it to a String. If the parameter 
       | has not been declared in the configuration file,
       | then use the default value. The getOptional
       | functions are also available for the other types below.
   * - | requestInt(String key)
       | requestOptionalInt(String key, int default)
     - | From the behavior model, request the parameter 
       | with key and cast it to an int
   * - | requestDouble(String key)
       | requestOptionalDouble(String key, double default)
     - | From the behavior model, request the parameter 
       | with key and cast it to a double
   * - | requestBoolean(String key)
       | requestOptionalBoolean(String key, boolean default)
     - | From the behavior model, request the parameter 
       | with key and cast it to Boolean
   * - | getReadSlot(String key)
       | getWriteSlot(String key)
       | getReadWriteSlot(String key)
     - | Request :ref:`memory slot <section_memory>` with specified key.
       | The :ref:`robotic behavior code <section_memory_scxml>` has to provide the other configurations needed.
   * - getSensor(String key, DataType T)
     - | Provides the :ref:`Sensor <section_sensor>` with the specified key 
       | from the **Bonsai config**. The sensor will return
       | data of the specified type T.
   * - getActuator(String key, InterfaceClass T)
     - | Provides :ref:`Actuator <section_actuator>` with specified key from the
       | **Bonsai config** and cast it to the 
       | interface class. 
   * - requestExitToken(ExitStatus exitStatus)
     - | Request an :ref:`ExitToken <section_exit_token>`
       | No configurations needed to get the ExitTokens.


.. note::
    Even though some function names for the :ref:`ObjectConfigurator <section_object_configurator>` and the ``SkillConfigurator`` are the same, 
    when requesting values, int, doubles, or booleans, the ``SkillConfigurator`` searches for the key inside the robotic behavior code (SCXML)
    and not in the Bonsai config ( as is done by the ``ObjectConfigurator``).

    **They are the parameters that can be provided to a skill through the SCXML and not the Bonsai configuration.** 

Let's assume we have the following configuration of actuators and sensors in the **Bonsai configuration file**:

.. code-block:: xml

    <!-- ACTUATORS -->
    <Actuator key="Example1" ... >
        <Options>
            <Option key="topic">/example</Option>
            <Option key="optional_int">1</Option>
        </Options>
    </Actuator>

    <!-- SENSORS -->
    <Sensor key="Example2" ... >
        ...
    </Sensor>

The ``configure`` function in the example skill below gets the ``SkillConfigurator`` as parameter.
With this it can request the sensors, actuators, parameters, slots and ExitTokens.

.. code-block:: java

    import ...
    import ExampleActuatorInterface;    // import the Actuator interfaces you want to use
    import SensorType;                  // import the DataType returned by the Sensor

    public class ExampleSkill implements AbstractSkill {

        // define here the keys of everything we want to get from the configurator
        private static final String KEY_ACTUATOR = "Example1";
        private static final String KEY_SENSOR = "Example2";
        private static final String KEY_STRING_PARAMETER = "StringParam";
        private static final String KEY_INT_PARAMETER = "IntParam";
        private static final String KEY_SLOT = "StringSlot";

        // Declare the Actuators, Sensors, Slots and parameters
        private ExampleActuatorInterface actuator;
        private ExampleSensorInterface sensor;
        private String paramName;
        private int optValue = 0;
        private Slot<String> slot;

        /*
        * This function uses the Skillconfigurator to get the configured objects and initialize everything
        * that has been declared above
        */
        public void configure(ISkillConfigurator conf) {
            this.actuator = conf.getActuator(KEY_ACTUATOR, ExampleActuatorInterface.class);    // returns ExampleActuator class
            this.sensor = conf.getSensor(KEY_SENSOR, DataType.class);          // returns ExampleSensor class
            this.paramName = conf.getValue(KEY_STRING_PARAMETER);
            this.optValue = conf.getOptionalInt(KEY_INT_PARAMETER, parameter2);
            this.slot = conf.getReadWriteSlot(KEY_SLOT);
        }

        ...

    }

The options and memory slots that a skill can request from the configurator are not defined in the Bonsai configs, but should be set within the code of the :ref:`robotic behavior <section_scxml>`.

.. note::
    
    It is good manner to initialize the keys for each object to be requested as class variables.
    This way, you can directly see the keys that you want to configure in your SCXML or Bonsai configuration.


.. _section_exit_token:

ExitToken
---------

ExitToken are used to create events after the skill is finished. To make sure all possible exit events are captured in the scxml the tokens have to be requested in the configuration method.

There exist three ExitTokens:

.. list-table:: ExitToken Types
   :widths: 15 15
   :header-rows: 1

   * - ExitToken
     - Purpose
   * - ``ExitStatus.SUCCESS()``
     - Is used when skill ended successfully.
   * - ``ExitStatus.ERROR()``
     - | An error or something unexpected occurred while trying 
       | to execute the skill. 
   * - ``ExitStatus.FATAL()``
     - | The skill could not be configured and is not running.
       | Usually, you won't need this one since the init()
       | already sends the FATAL token if something went wrong.
   * - ``ExitStatus.LOOP()``
     - | When execute() returns the Loop token, it will re-run the 
       | execute() function until one of the other tokens is returned.
       | Useful when one awaits the result from a Future object.

.. note:: 

    * Usually you should only need to request the success and error token.
    * ``FATAL`` and ``LOOP`` tokens can always be used without registering

ExitTokens can be requested from the configurator:
::

    @Override
    public void configure(SkillConfigurator configurator) {
        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
    }

Sometimes, we need more refined ExitTokens. 
For that case we can append the tokens with a status.
Let's take a skill that detects objects as an example. 
The skill can run successfully. However, which can mean it detected no objects or at least one object.
To distinguish this case, we can do the following:
::

    @Override
    public void configure(SkillConfigurator configurator) {
        // request all tokens that you plan to return from other methods
        tokenSuccessNoObj = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("no_obj"));
        tokenSuccessDetected = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("detected"));
    }


.. warning:: 

  For each ExitToken, you should make sure that either **ALL** or **NONE** of that exit tokens have a ps.
  Don't define e.g. ``ExitToken.SUCCESS()`` without a ps when you already have defined ``ExitToken.SUCCESS().ps("example")``