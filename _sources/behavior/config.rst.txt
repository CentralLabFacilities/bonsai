.. _spec: http://www.w3.org/TR/scxml/
.. _JEXL: https://commons.apache.org/proper/commons-jexl/reference/syntax.html

.. highlight:: xml

===================
SCXML Configuration
===================

How to set Configuration
------------------------

Bonsai SCXML Statemachine Configuration is done in the datamodel of any scxm file.

Example:

.. code-block:: xml

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="A">
        <datamodel>
            <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.'"/>
        </datamodel>

.. note::
    Remember :ref:`Sourced<scxml sourcing>` files get copied into the main file.
    Set Configurations only in the topmost scxml to avoid suprises

Configurations
--------------

`#_STATE_PREFIX` 
................

defaults to: `de.unibi.citec.clf.bonsai.skills.`

Package prefix for skills:

.. code-block:: xml

    <state id="Fatal"/>


Results in skill: `de.unibi.citec.clf.bonsai.skills.Fatal` being executed.

`#_DISABLE_DEFAULT_SLOT_WARNINGS`
.................................

defaults to `false`

`#_ENABLE_SKILL_WARNINGS`
.........................

defaults to `false`

`#_GENERATE_DEFAULT_SLOTS`
..........................

defaults to `false`

`#_CONFIGURE_AND_VALIDATE`
..........................

defaults to `true`

`#_ENABLE_CONFIG_CACHE`
.......................

defaults to `false`

`#_FINAL_STATES`
................

defaults to `true`

Always assume `End` and `Fatal` as final states and stop the statemachine. 


`#_SEND_ALL_TRANSITIONS`
........................

defaults to `false`

If disabled only informs Listeners of transitions from active Skills. (e.g. ROS UI will not display possible transitions defined in Parent States)