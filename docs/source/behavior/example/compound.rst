===============
Compound States
===============

States can consist of multiple other states. These states are grouped:

.. code-block:: xml

    <state id="DoCoolStuff" initial="example.Succeeder">

        <!-- we can also define transitions here -->
        <!-- The parent states transition gets checked if none of the childs matches -->
        <transition event="Succeeder.*" target="Fatal"/>

        <state id="example.Succeeder">
            <transition event="Succeeder.success" target="example.Succeeder#again"/>
        </state>

        <state id="example.Succeeder#again">
            <transition event="Succeeder.success" target="example.Nothing"/>
        </state>

    </state>

    <state id="example.Nothing">
        <!-- this is a easy reference to transition too -->
        <transition event="Nothing.fatal" target="DoCoolStuff"/>
    </state>