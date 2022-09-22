=======
Changes
=======

Bonsai Legacy Changes

Modules
-------

Bonsai uses a new module layout

- Bonsai Core
    - Core Implementation: object configuration, skill configuration, runner

- Bonsai Interfaces
    - Object Interfaces: Actuators,Sensors Old core
    - Data Definitions: Old BTL-Core

- Bonsai Skills
    - Core Skills: Old bonsaiBehavior skills

- Bonsai SCXML
    - SCXML statemachine Implementation : old bonsaiBehavior engine
    - SCXML guis/server

- Bonsai Adapter
    - Interface Implementations: Objects and Data
    - Old btl-mw and core-mw-actuator/sensor

This results in the Dependency Graph::

    Core -> Interfaces -> Skills
    Core -> SCXML-common
    Interfaces -> Adapter-mw

(SCXML-mw implementations depends on the corresponding adapter)

- SCXML has a Server+Gui implementation that runs without any middleware (single binary)
- To use different adapter or skill packages you have to add them to the classpath of your scxml-binaries - the easiest way to do this is creating a 'dist' project that uses appassembler and depends on the needed packages


SCXML
-----

Sourcing
~~~~~~~~

sourcing can now utilize defined mappings instead of relative paths

.. code-block:: xml

    <state id="consume" src="${TEST}/memorySlots.xml"/>

the mappings can be set with the -m option example::

    -m TEST=/tmp/statemachines -m BEHAVIORS=/tmp/statemachines/behaviors

Core
----

Skills
~~~~~~

- Skills no longer have variables (getVariables/MapReader)
    - instead you can request parameter during configuration
    - this results in better verification: missing/obsolete parameter, optional parameter with the defaults and parameter types

Sensors
~~~~~~~

- Wire type is now a required attribute for Sensors

.. code-block:: xml

    <Sensor key="SpeechSensor"
        dataTypeClass="de.unibi.citec.clf.btl.data.speechrec.Utterance"
        factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
        sensorClass="de.unibi.citec.clf.bonsai.ros.sensors.RosBtlMsgSensor"
        wireTypeClass="std_msgs.String">

