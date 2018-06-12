====================
Bonsai Core Tutorial
====================

Bonsai is a multi layered approach for behavior modelling of complex systems.

Behavior Layer - Action Layer - Interface Layer - Funcional Component Layer - Hardware Layer

The Bonsai framework uses ``skills`` as the ``Action Layer`` which represent reuseable actions for some type of hardware. These Skills use different In/Output interfaces (``Sensors`` and ``Actuators`` of the ``Interface Layer``). To Create complex behavior Bonsai skills can be in different control layers e.g. FSM/HSM such as ``SCXML``

Configuration
-------------

The BonSAI system must be configured. Usually you can use the ``BasicActuators.xml`` and the ``BasicSensors.xml``


SCXML
=====

Finite state machines with described in an xml-like state machine language apache-scxml.


.. |bonsai-layer| image:: /_static/img/bonsai-layer.png

Structure
=========

The RoboCup [Exercise] project has the following structure:

::

    PROJECT/src/main/
               |--- config/
                     |---  bonsai_configs/ (BonSAI configuration files)
                     |---  state_machines/ (SCXML files)
               |--- java/de/unibi/citec/clf/bonsai/skills/ (implementations)

Test Statemachine during developement
-------------------------------------

in the RobocupathomeDist ``Robocup@home [BIN]`` module.

Copy "resource/localMapping.default.properties" as "localMapping.properties" and enter the path to your cloned repositories

- Use ``LaunchLocal`` to start the client.

Using RSB version
-----------------

- configure rsb to use the vdemo spread port:

::

    {.config/rsb.conf}

    [plugins.cpp]
    load = rsbspread

    [transport.socket]
    enabled = 0

    [transport.spread]
    enabled = 1
    host = localhost
    port = 4803


- Start spread and roscore with vdemo

- Load and start your statemachine and config in netbeans by running the Bonsai and the FXGUI launchfile

- if you simply changed your xml code reload using the gui (STOP/LOAD), restart Bonsai server after changes to skills





