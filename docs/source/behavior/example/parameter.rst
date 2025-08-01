========================
Parameters and Variables
========================

Parameters
----------

Some skills require further parameters that you don't necessarily want to write in a slot. 
For that case, the state machine enables propagating parameters to the skill.

For example, the skill ParameterHaver defines two parameters "value" and "optional": 

.. code-block:: kotlin

    class ParameterHaver : AbstractSkill() {

        private var value = ""
        private var optional = false

        //...

        override fun configure(configurator: ISkillConfigurator) {
            // ...
            value = configurator.requestValue("value")
            optional = configurator.requestOptionalBool("option", optional)
        }
        // ...
    }

Each Parameters needs to be requested by the configurator.
The "optional" parameter here is an optional bool value. 

When we are using this skill in the state machine, we can provide the skill with these parameters. 
The parameter "value" *must* be provided in the state machine. The parameters have to be set in a ``datamodel/data`` **within** the state:
The ``expr`` value is *read as string* by the skill. Remember to use additional singlequotes. 

.. code-block:: xml

    <state id="example.ParameterHaver">
        <!-- skill parameter are read from the state datamodel -->
        <datamodel>
            <data id="value" expr="'Hello'"/>
        </datamodel>
        <transition event="ParameterHaver.*" target="example.ParameterHaver#option"/>
    </state>

    <state id="example.ParameterHaver#option">
        <datamodel>
            <data id="value" expr="'World'"/>
            <data id="option" expr="true"/>
        </datamodel>
        <transition event="ParameterHaver.*" target="End"/>
    </state>

.. warning:: 
    Make sure to use extra quotes for strings! ``<data id="value" expr="'Hello'"/>``.
    Booleans and numbers do not need the extra quotes.


SCXML Variables
---------------

SCXML Variables should not be specific for each state but rather for the whole state machine. As such, they are defined in the datamodel of the state machine:
To use SCXML Variables as parameters we need to mark them with ``@``. 

.. code-block:: xml

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="example.ParameterHaver">
        <datamodel>
            <data id="hellosToSpeak" expr="3"/>
        </datamodel>

        <state id="example.ParameterHaver">
            <datamodel>
                <data id="value" expr="'@hellosToSpeak'"/>
            </datamodel>
            <transition event="ParameterHaver.*" target="End" />
        </state>
    </scxml>

The ParameterHaver skill gets the "hellosToSpeak" variable assigned as parameter.

.. warning:: 
    Since the "expression" is read as a string, we need to add singlequotes and ``@`` or scxml may try to evaluate the expression as jexl:
    ``<data id="value" expr="'@hellosToSpeak'"/>``

During transitions we can execute SCXML actions. 
The scxml variables can be changed by assigning them a new value using the "assign" action: 

.. code-block:: xml

    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="example.ParameterHaver">
        <datamodel>
            <data id="hellosToSpeak" expr="3"/>
        </datamodel>

        <state id="example.ParameterHaver">
            <datamodel>
                <data id="value" expr="'Hello'"/>
            </datamodel>
            <transition event="ParameterHaver.*" target="example.ParameterHaver" >
                <assign location="hellosToSpeak" expr="hellosToSpeak - 1"/>
            </transition>
        </state>
    </scxml>    

With variables, we also can introduce conditions in transitions. For example, as long as "hellosToSpeak" is greater than 1, we want ParameterHaver to be executed again.
This can be done by adding ``cond="hellosToSpeak > 1"`` in the transition. Another transition without any conditions is then defined at the end:

.. code-block:: xml

    <state id="example.ParameterHaver">
        <datamodel>
            <data id="value" expr="'Hello'"/>
        </datamodel>
        
        <transition event="ParameterHaver.*" cond="hellosToSpeak > 1" target="example.ParameterHaver">
            <assign location="hellosToSpeak" expr="hellosToSpeak - 1"/>
        </transition>
        <transition event="ParameterHaver.*" target="End" />
    </state>

On Entry/Exit
-------------

We can also use the on_entry/on_exit actions of the state to assign some values to a variable. 
The on_entry action here decrements the "hellosToSpeak" variable each time the state machine transitions back to the state:

.. code-block:: xml

    <state id="example.ParameterHaver">
        <datamodel>
            <data id="value" expr="'Hello'"/>
        </datamodel>

        <onentry>
            <assign location="hellosToSpeak" expr="hellosToSpeak - 1"/>
        </onentry>

        <transition event="ParameterHaver.*" cond="hellosToSpeak > 0" target="example.ParameterHaver" />
        <transition event="ParameterHaver.*" target="End" />
    </state>