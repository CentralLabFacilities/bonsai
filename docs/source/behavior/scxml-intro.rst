.. _spec: http://www.w3.org/TR/scxml/
.. _JEXL: https://commons.apache.org/proper/commons-jexl/reference/syntax.html

.. highlight:: xml

SCXML Definitions
=================

We use Apache Commons XML to create our robot behavior.

The Bonsai Engine reads these files to couple simple skills to rich robot behavior.
BonsaiSCXML is not utilizing the whole `spec`_. This page introduces all the relevant parts of SCXML

State
-----

States define the possible “situations” (or states) the Statemachine can be in.

If the Statemachine is running all current states are called active.

Example State:

::

    <state id="A"/>

- A state is a XML element with the ``state`` tag.
- The Attribute ``id`` is required and defines the ``StateID``.

The root element requires an attribute to denote the starting State of the Statemachine.
::

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">


States can have Substates. The initial Attribute is required and needs to be a child of the parent.

::

    <state id="A" initial="B">
        <state id="B"/>
        <state id="C"/>
    </state>

-  If a child is active all parent states are active as well.
-  States may have ``onentry`` and  ``onexit`` elements which may contain actions(`executable content`_) to be executed on entry or exit of the state.

.. _`executable content`: https://www.w3.org/TR/scxml/#executable

Parallel
~~~~~~~~

The ``<parallel>`` element encapsulates a set of child states which are simultaneously active when the parent element is active.

-  Parallel has to be exited from the parallel state. (transition outside parallel cant happen in child states)
-  More exactly: first child states of parallel should not have transitions.

Example:

::

    <parallel id="Talk">
        <!-- Transitions from child states to outside the parallel need to be defined here -->
        <transition event="DoThingsA.fatal" target="Fatal"/>
        <transition event="DoThingsA.success" target="End"/>
        <transition event="DoThingsB.fatal" target="Fatal"/>
        <transition event="DoThingsB.success" target="End"/>

        <state id="DoThingsA">
            <!-- transitions going out of this child state are defined above -->
        </state>

        <state id="DoThingsB">
        </state>

    </parallel>

    <state id="three"/>

.. note::

    * You can combine compound states with parallel states to run a `sequence of states` in parallel with something else.
    * Within the compound states you can only transition to child states of the compound. Otherwise the state machine will break!


::

    <parallel id="ParallelState">
        <!-- Transitions from child states to outside the parallel need to be defined here -->
        <transition event="compoundChild.fatal" target="Fatal"/>
        <transition event="anotherCompoundChild.*" target="End"/>
        <transition event="parallelChild.*" target="End"/>

        <state id="CompoundState" initial="compundChild">

            <state id="compoundChild">
                <transition event="compundChild.success" target="anotherCompoundChild"/>
            </state>

            <state id="anotherCompoundChild">
            </state>
        </state>

        <state id="parallelChild">
        </state>

    </parallel>


Datamodel
---------

The data model is defined via the ``<datamodel>`` element, which contains zero or more elements, each of which defines a single data element and assigns an initial value to it.

-  If you want to use the data in guard conditions define the needed data entrys in the root element.
-  They can then be updated via the assign action.

Example:

::

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="one">
    <datamodel>
        <data id="number" expr="'1'"/>
    </datamodel>

-  The ``expr`` attribute should use additional single quotes

Event/Transition
----------------

-  Transitions are triggered by events
-  They may contain actions, which are executed when the transition is taken
-  All active states get checked for matching Transitions beginning with the deepest child.
-  If the Transition has the target attribute, a state change is triggered and the active state changes.

Example:

::

    <transition event="one"/>

::

    <transition event="one" target="b"/>

Regex
~~~~~

You can use Regex to define events::

    <transition event="A.*">

This should be used with caution as there are some `Implicit events`_

Condition
~~~~~~~~~

Transition can be conditionalized via guard conditions

Example:

::

    <transition event="one" cond="number==1" target="b"/>

-  we use `JEXL`_ operators

Actions
-------

Actions is the nane of executable content inside ``onentry`` ``transition`` and ``onexit`` elements.

-  we use assign_ and send_

.. _send: https://www.w3.org/TR/scxml/#send
.. _assign: https://www.w3.org/TR/scxml/#assign


Send
~~~~

Send is used to create events

.. code-block:: xml

    <send event="A"/>

-  used in behavior Statemachines

Assign
~~~~~~

Assign is used to update data entrys

.. code-block:: xml

    <assign location="number" expr="2"/>



.. _scxml sourcing:

Sourcing
--------

It is possible to use multiple other statemachines by ``sourcing`` them within your main state machine.
Within your main state machine, you would **source** other xmls **in a state**.

When you source another state machine, when compiling it's states and transitions are copied into the main state machine.
All **states** and **success**, **error** and **fatal** events of the sub state machine get suffixed by the sourcing state ``id`` (this includes hashes).
This means that variables defined within a state machine are **global**. 

.. warning::

    * If you define the same variable within mutliple substates  but with different values, the actual value of the parameter is undeterministically one of the defined values **for all** main and sub state machines.
    * To reduce the risk of undeterministic robot behavior, don't define variables with the same name within your state machine and sub state machines.
    * See the example below

Following things have to be made sure when sourcing other state machines:

- all sub state machines have to send either success, error, or fatal when exiting
- The main state machine needs transitions for all of the exit tokens, using regex here is not allowed.
- don't use #suffix in a sourcing state

Example:

.. code-block:: xml

    Document main.xml:
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
        <datamodel>
            <data id="param1" expr="'exampleString1'"/>
        </datamodel>

        <state id="A" src="${MAPPING}/b.xml"/>
    </scxml>

    -------------------------------------------------------------------------

    Document sub.xml:
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="B">

        <datamodel>
            <data id="param2" expr="'exampleString2'"/>
        </datamodel>

        <state id="B">
            <transition event="one" target="C"/>
        </state>

        <state id="C">
            <transition event="one">
                <send event="success"/>
            </transition>
        </state>
    </scxml>

Result:

.. code-block:: xml

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">

        <!-- Combined data model from main and sub-->
        <datamodel>
            <data id="param1" expr="'exampleString1'"/>
            <data id="param2" expr="'exampleString2'"/>
        </datamodel>

        <!-- State machine B has been copied here -->
        <state id="A" initial="B#A">
            <state id="B#A">
                <transition event="one" target="C#A"/>
            </state>

            <state id="C#A">
                <transition event="one">
                     <send event="A.success"/>
                </transition>
            </state>
        </state>
    </scxml>



Connect Skill to State
----------------------

- Skills are Java Classes that implement ``AbstraktSkill``. 
- You will find basic skills in Bonsai [Core Skill].
- If the ``id`` of a state matches the path to a skill the skill gets executed on entry of the state.
- If you have a skill in [Core Skill] under skills/nav called Drive the matching state id would be ``nav.Drive``.

  - Note that this is due to the fact that at the start of our state machine we set a state prefix with the full path.
- To have different states using the same skill you can differentiate between them using # in the state ``id``

Example:

.. code-block:: xml

     ...

     <state id="nav.Drive#toKitchen">
        ...
     </state>

     ...

     <state id="nav.Drive#away">
        ...
     </state>

     ...

Implicit events
---------------

Commons SCXML provides some **interesting** extensions, generating some internal events automatically. As they are named <ID>.<event> you may accidentally cause transitions while using regex as transition events for Skills (e.x. ``id="Wait"``) or Compount States (Sourcing_)

.entry and .exit
~~~~~~~~~~~~~~~~

The Commons SCXML implementation generates a ``.entry`` event when any state is entered and a ``.exit`` when a state is exited.

.change
~~~~~~~

Similarly to the ``.entry`` and ``.exit`` event the Commons SCXML implementation generates a ``.change`` event when a piece of any data model changes, which means one can watch some part of the datamodel for an update for triggering a transition. This is quite useful for communicating across regions etc.

.. code-block:: xml
    
    <scxml xmlns="http://www.w3.org/2005/07/scxml"
        version="1.0" initial="main">

    <datamodel>
        <data name="current"/>
    </datamodel>
            
    <parallel id="main">
            
        <!-- "master" state machine -->
        <state id="master" initial="state_1">
            <state id="state_1">
                <transition event="someevent" target="state_2"/>
            </state>
            <state id="state_2">
                <transition event="someevent" target="state_3"/>
            </state>
            <state id="state_3">
                <transition event="someevent" target="state_1"/>
            </state>
        </state> <!-- end state master -->
                            
        <!-- "slave" state machine -->
        <!-- this state machine acts on .entry events of our master state machine -->
        <state id="slave">
            <transition event="state_1.entry">
                <assign location="current" expr="'state_1'"/>
            </transition>
            <transition event="state_2.entry">
                <assign location="current" expr="'state_2'"/>
            </transition>
            <transition event="state_3.entry">
                <assign location="current" expr="'state_3'"/>
            </transition>
        </state> <!-- end of slave -->
                            
        <!-- watch for data model changes -->
        <state id="watch_changes">
            <transition event="current.change">
                <!-- duh -->
            </transition>
        </state>

    </parallel> 
    </scxml>
