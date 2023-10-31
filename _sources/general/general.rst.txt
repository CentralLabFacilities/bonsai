====================
Bonsai Core Tutorial
====================

Bonsai is a multi layered approach for behavior modelling of complex systems.

Behavior Layer - Action Layer - Interface Layer - Funcional Component Layer - Hardware Layer

The Bonsai framework uses ``skills`` as the ``Action Layer`` which represent reuseable actions for some type of hardware. These Skills use different In/Output interfaces (``Types``, ``Sensors`` and ``Actuators`` of the ``Interface Layer``). To Create complex behavior Bonsai skills can be in different control layers such as ``SCXML``
Interfaces are implemented for different middlewares. They include serializer between middleware specific and bonsai ``Types``.

Configuration
-------------

The BonSAI system must be configured. Usually you can use the ``BasicActuators.xml`` and the ``BasicSensors.xml``


SCXML
=====

Combination of finite state machines and harel statecharts, described in an xml-like state machine language apache-scxml.

Structure
=========

The RoboCup [Exercise] project has the following structure:

::

    SCXML/src/main/
               |--- config/
                     |---  bonsai_configs/ (BonSAI configuration files)
                     |---  state_machines/ (SCXML files)
    SKILLS/src/main/                
               |--- java/de/unibi/citec/clf/bonsai/skills/ (implementations)
    BIN/src/main/                
               |--- java/de/unibi/citec/clf/bonsai/LaunchLocal.java (executeable)

Test Statemachine during developement
-------------------------------------

in the RobocupathomeDist ``Robocup@home [BIN]`` module.

Copy "resource/localMapping.default.properties" as "localMapping.properties" and enter the path to your local repositories

- Use ``LaunchLocal`` to start the client.



