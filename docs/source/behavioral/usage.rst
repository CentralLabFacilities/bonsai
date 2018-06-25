===========
Usage Guide
===========

1. call ``String listScenarios()``
	- returns a ";" seperated string containing all scenarios

2. call ``boolean changeScenario(String)`` to set the scenario

3. call ``String listActions()``
	- returns a ";" seperated string containing all actions of the currently loaded scenario

4. (optional) call ``dict getActionParams(String action)`` to get the dict used to start the action

5a. (optional) change parameter of the dict

6. call ``boolean startAction(dict/string)`` to start the action
	- parameter can be used with strings ex. ``name=speakTobi,text="hello"`` where name is the name of the action

7. call (async) ``boolean isDone()`` wait until future.isDone, the returned value is true if the action completed without errors.