=================
Coding Guidelines
=================

.. note::

    Some things are Team ToBI (Robocupathome Team of Bielefeld) specific

All Skills and behaviours in bonsai-skills shall be properly documented.

Skills
------

Reference Skills::

    knowledge.SetTargetByKnowledgeBase
    nav.drive.NavigateTo

Usage Documentation
~~~~~~~~~~~~~~~~~~~

Above the class declaration of the skill there should be a short paragraph highlighting the usage of the skill. It shall be of the form:

.. code-block:: text

    A short summary of what this skill does exactly.

    <pre>
    Options: 
    A summary of the optional data this skill can be given. Each shall be of the form:
    #_KEY_NAME: [type of the key] *additional information such as "Optional (default: defaultvalue)"*

    Slots:
    A summary of what slots this skill reads/writes. Each shall be of the form:
    NameOfTheSlot: [type of the slot] [Read or Write] *additional information such as "optional"*
            -> Description of what this slot exactly contains

    ExitTokens:
    A summary of which ExitTokens this skill uses. Each shall be of the form:
    exittoken.name.as.encountered.in.scxml         Description of why this ExitToken was set

    Actuators: 
    A summary of the actuators used by this skill. Each shall be of the form:
    ActuatorName as given in the bonsai-config: [Type of the Actuator]
        -> Reason why/ how/ what this Actuator is used (for)

    Sensors:
    Analogous to  Actuators.
    </pre>


Code Comments
~~~~~~~~~~~~~

Please only comment complex code fragments and avoid only declarative statements such as `retrieving slot`, `keys` / `exittokens`/ `actuators` as they clutter the skill and should be obvious if the other guidelines are respected. Other often used code blocks, such as blocks to retrieve slot contents should not be commented, as they are widely used and their usage should be obvious.

Naming of Variables
~~~~~~~~~~~~~~~~~~~~~

- Parameter Keys should be prefixed with `KEY_`
  - The Key value should be prefixed with `#_`
- ExitTokens should start with `token`

Ordering of Variables
~~~~~~~~~~~~~~~~~~~~~

Variables shall be declared (and used in configure) in the following order:

1. Keys
2. Variables for storing key-values
3. ExitTokens
4. MemorySlotReader/Writer
5. Actuators and Sensors
6. Variables for Slot values
7. Variables used

Each kind of variable should form a block (no blank lines) and be seperated by others via a blank line. 

Order of methods
~~~~~~~~~~~~~~~~

The methods of a skill shall always be in the following order:

1. configure()
2. init()
3. execute()
4. end()
5. other custom methods used by the skill

How to use init(), execute() and end()
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

init()
......

init() shall mainly be used to retrieve slots and prepare acutator calls.

execute()
.........


execute() shall never block. Actuator calls should always either return a Future, over which should be looped, or timeout after some time. Looping because of waiting should never be done inside execute(), but rather be realized via returning ExitToken.loop(). Because of this, it is best practice to call an actuator in init and return ExitToken.loop() as long as the Future returned by the actuator call is not done.

end()
.....

end() shall mainly be used for memorizing data. Please note that end is invoked even if init returns false. This means that in most cases you would want to check for the given ExitToken before you e.g. memorize some variable.

Defensive recalling and memorizing of slots
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Recalling and memorizing should always be followed by by a check if the recalled object is null, in case the recalled slot was emtpy. It shall also always be accompanied by understandable logger outputs, at least in the case of an error/ exception.

Statemachines
-------------

- Skills should *NOT* be given scxml data parameter ``@DATA`` if this changes the configure requests.

*ExampleSkill* ``Configure()``:

.. code-block:: java

    useAct = configurator.requestOptionalBool("#_USE", false);
    if(useAct) act = configurator.getActuator("Foo", Bar.class);

If ``#_USE`` is set to ``@DATA`` with expression ``false`` during LOAD but gets changed to ``true`` with ``<assign>`` the State will not function properly


Location
~~~~~~~~

- Robocup Task SCXML should be created in the ``robocupathome-dist/scxml`` project

- Documented Behavior SCXML that uses _only_ core skills should be moved to the ``scxml-common`` project

Reference Behaviours::

    nav.navigateToAnnotation
    knowledge.storeCurrentPosition

Usage Documentation
~~~~~~~~~~~~~~~~~~~

Above the statemachine there should always be a short paragraph to describe the behaviour. It shall be of the form:

.. code-block:: xml

    <!-->
    A summary what this behaviour exactly does.

    Used Slots:
    A short summary of the Slots this Behaviour gets/writes its data from/to
        What this specific slot is used for:
        -> xpath="/nameOfTheBehaviour/slotName"

    A state declaration, ready to be copy-pasted and slightly adjusted. Example:
    <state id="navigateToPerson" src="${ROBOCUP}/behavior/nav/navigateToPerson.xml">
            <onentry>
                    <assign location="personLostTimeout"    expr="100"/>
                    <assign location="stopDistance"         expr="800"/>
                    <assign location="strategy"             expr="NearestToTarget"/>
                    <assign location="refindDistance"       expr="800"/>
            </onentry>
            <transition event="navigateToPerson.success"    target="TOFILL"/>
            <transition event="navigateToPerson.personLost" target="TOFILL"/>
            <transition event="navigateToPerson.fatal"      target="TOFILL"/>
    </state>

    Look up the skill documentation to see what the options do.
    Only assign values where you differ from the default. otherwise if someone finds
    better working default values you will not profit from that!
    <!-->
