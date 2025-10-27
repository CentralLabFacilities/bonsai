============================================
Bonsai - Bielefeld Sensor Actuator Interface
============================================

Bonsai is a multi layered Java (and Kotlin) framework for behavior modelling of complex systems
It serves as an abstraction layer between the robots hardware and the robot behavior. 
With Bonsai, when deploying on another robot you should be able to only reimplement the sensor and actuator interface while the actual robot behavior is agnostic to the robot hardware and can remain unchanged.

You can read the published paper `here <https://link.springer.com/article/10.1007/s12369-013-0209-8>`_ and `here <https://www.researchgate.net/profile/Sven-Wachsmuth/publication/267687020_A_Modeling_Framework_for_Reusable_Social_Behavior/links/576906bc08aef9750b10337c/A-Modeling-Framework-for-Reusable-Social-Behavior.pdf>`_

When using Bonsai, robot behavior consists of :ref:`Sensors <section_sensor>`, :ref:`Actuators <section_actuator>` and :ref:`Skills <section_skills>`.
Sensors offer information about the outside world while Actuators are used to activate parts of the robot system.
Skills use Actuators and Sensors to to a single task.

**Robotic behavior** can then be implemented using some kind of behavior modeling or control logic.
The behavior model can be modeled e.g. using Behavior Trees or state machines.
It controls which skills should be used in which sequence.
Bonsai implements the :ref:`SCXML Engine <section_scxml>` which is a XML-based language for describing finite state machines in the SCXML standard and executes state-based behavior.


.. note:: 

    Within this documentation, we will sometimes refer the behavior model as SCXML, robot behavior code or just state machine.

.. toctree::
    :maxdepth: 2

    Data Types <general/datatypes>
    Sensors and Actuators <general/sensor_actuator>
    Memory Slots <general/memory>
    Skills <general/skills>
    Bonsai Configuration <general/config>

